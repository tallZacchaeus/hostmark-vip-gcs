// The flight-change cascade (FR-FT-04/05/07/08) as a pure plan: new times at the venue, moved
// pickups, drivers who keep a trip (told automatically), and proposals where a person must decide
// (assign, reassign, release). The live ingest applies the plan; the what-if preview only shows
// it — so the preview can never disagree with what would really happen.
import { effectiveArrival, type FlightPhase, type FlightTimes } from '@/lib/domain/flights/schedule'
import { addMinutes } from '@/lib/domain/time'
import { type Match, type MatchDriver, type MatchShift, type MatchTrip, type PickupKind, type TravelTimes, matchDrivers } from './matcher'

export type PickupStatus = 'pending_assignment' | 'assigned' | 'en_route' | 'picked_up' | 'completed' | 'cancelled'
export type CascadeProposalKind = 'driver_assignment' | 'driver_reassignment' | 'release_pickup'

export interface CascadeEvent extends TravelTimes {
  readonly airport_exit_buffer_min: number
  readonly timezone: string
  readonly venue_name: string
  readonly arrival_airports: readonly string[]
}

export interface CascadeFlight extends FlightTimes {
  readonly id: string
  readonly flight_number: string
  readonly phase: FlightPhase
}

export interface CascadeArrival {
  readonly id: string
  readonly delegation_name: string
  readonly expected_at_venue_at: string | null
  readonly passenger_count: number
}

export interface CascadePickup {
  readonly id: string
  readonly arrival_id: string
  readonly kind: PickupKind
  readonly pickup_at: string
  readonly pickup_location: string
  readonly status: PickupStatus
  readonly passenger_count: number
  readonly driver_ids: readonly string[]
}

export interface CascadeInput {
  readonly event: CascadeEvent
  /** The flight as it is after the change. */
  readonly flight: CascadeFlight
  readonly arrivals: readonly CascadeArrival[]
  readonly pickups: readonly CascadePickup[]
  readonly drivers: readonly MatchDriver[]
  readonly shifts: readonly MatchShift[]
  /** Every live trip (including these pickups' own). */
  readonly trips: readonly MatchTrip[]
}

export interface PlannedProposal {
  readonly kind: CascadeProposalKind
  /** The existing pickup, or null for a pickup this plan creates (see new_pickup_index). */
  readonly pickup_id: string | null
  readonly new_pickup_index: number | null
  readonly title: string
  readonly summary: string
  readonly driver_ids: string[]
  readonly alternatives: string[]
  /** What else the decision changes, e.g. "Pickup moves from 14:10 to 14:55". */
  readonly also_changes?: string
}

export interface CascadePlan {
  readonly arrivals: { readonly id: string; readonly expected_at_venue_at: string | null; readonly attention: string | null }[]
  readonly pickup_times: { readonly id: string; readonly pickup_at: string; readonly previous_pickup_at: string }[]
  readonly new_pickups: { readonly arrival_id: string; readonly pickup_location: string; readonly dropoff_location: string; readonly pickup_at: string; readonly passenger_count: number }[]
  readonly proposals: PlannedProposal[]
  /** Assigned drivers who can still make the new time: updated without a decision (P1 rule 2). */
  readonly kept: { readonly pickup_id: string; readonly driver_ids: readonly string[]; readonly pickup_at: string }[]
  /** Nobody can take a trip: the coordinator is told. */
  readonly alerts: { readonly pickup_id: string | null; readonly title: string }[]
}

/** Trips that can still move: nobody is on the way yet. */
const MOVABLE: ReadonlySet<PickupStatus> = new Set(['pending_assignment', 'assigned'])
const CLOSED: ReadonlySet<PickupStatus> = new Set(['picked_up', 'completed', 'cancelled'])
const MIN_CHANGE_MS = 60_000

export const emptyPlan = (): CascadePlan => ({ arrivals: [], pickup_times: [], new_pickups: [], proposals: [], kept: [], alerts: [] })

/** "14:55" in the event's time zone. */
export function clock(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(iso))
}

const names = (ids: readonly string[], drivers: readonly MatchDriver[]): string =>
  ids.map((id) => drivers.find((driver) => driver.id === id)?.full_name ?? 'a driver').join(' and ')

const delayText = (flight: CascadeFlight): string => {
  const scheduled = flight.scheduled_arrival_at ? new Date(flight.scheduled_arrival_at).getTime() : null
  const best = effectiveArrival(flight)
  if (scheduled === null || !best) return 'a new time'
  const minutes = Math.round((best.getTime() - scheduled) / 60_000)
  return minutes === 0 ? 'on time' : minutes > 0 ? `${minutes} min late` : `${-minutes} min early`
}

/** An assignment proposal for a pickup nobody drives yet (also used outside the cascade). */
export function assignmentProposal(
  pickup: { readonly id: string | null; readonly pickup_at: string; readonly pickup_location: string; readonly passenger_count: number },
  delegationName: string,
  match: Match,
  drivers: readonly MatchDriver[],
  timeZone: string,
  newPickupIndex: number | null = null,
): PlannedProposal {
  const time = clock(pickup.pickup_at, timeZone)
  return {
    kind: 'driver_assignment',
    pickup_id: pickup.id,
    new_pickup_index: newPickupIndex,
    title: `Assign a driver for ${delegationName} (${time})`,
    summary: `Pickup ${time}, ${pickup.pickup_location}, ${pickup.passenger_count} ${pickup.passenger_count === 1 ? 'passenger' : 'passengers'}. Best match: ${names(match.driver_ids, drivers)}.`,
    driver_ids: match.driver_ids,
    alternatives: match.alternatives,
  }
}

function planCancellation(input: CascadeInput): CascadePlan {
  const { flight, arrivals, pickups, event } = input
  const plan = emptyPlan()
  const word = flight.phase === 'cancelled' ? 'cancelled' : 'diverted'
  for (const arrival of arrivals) {
    plan.arrivals.push({ id: arrival.id, expected_at_venue_at: arrival.expected_at_venue_at, attention: `Flight ${flight.flight_number} ${word}` })
    for (const pickup of pickups.filter((item) => item.arrival_id === arrival.id && !CLOSED.has(item.status))) {
      plan.proposals.push({
        kind: 'release_pickup',
        pickup_id: pickup.id,
        new_pickup_index: null,
        title: `Release the pickup for ${arrival.delegation_name}`,
        summary: `${flight.flight_number} was ${word}. The ${clock(pickup.pickup_at, event.timezone)} pickup is no longer needed; confirm the new plan with the delegation.`,
        driver_ids: [],
        alternatives: [],
      })
    }
  }
  return plan
}

export function planCascade(input: CascadeInput): CascadePlan {
  const { event, flight, arrivals, pickups, drivers, shifts } = input
  if (flight.phase === 'cancelled' || flight.phase === 'diverted') return planCancellation(input)
  const landing = effectiveArrival(flight)
  if (!landing) return emptyPlan()

  const plan = emptyPlan()
  const pickupAt = addMinutes(landing.toISOString(), event.airport_exit_buffer_min)
  const atVenue = addMinutes(landing.toISOString(), event.airport_exit_buffer_min + event.airport_travel_min)
  // Later decisions in this plan must see the trips it has already moved.
  let trips: MatchTrip[] = input.trips.map((trip) => ({ ...trip }))

  for (const arrival of arrivals) {
    if (arrival.expected_at_venue_at === null || new Date(arrival.expected_at_venue_at).getTime() !== new Date(atVenue).getTime()) {
      plan.arrivals.push({ id: arrival.id, expected_at_venue_at: atVenue, attention: null })
    }
    const pickup = pickups.find((item) => item.arrival_id === arrival.id && item.kind === 'airport' && item.status !== 'cancelled')
    if (!pickup) {
      const location = event.arrival_airports.length > 0 ? `${event.arrival_airports.join(' / ')} airport, arrivals` : 'Airport arrivals'
      const index = plan.new_pickups.push({ arrival_id: arrival.id, pickup_location: location, dropoff_location: event.venue_name, pickup_at: pickupAt, passenger_count: arrival.passenger_count }) - 1
      const match = matchDrivers({ pickup_id: `new-${index}`, pickup_at: pickupAt, kind: 'airport', passenger_count: arrival.passenger_count, current_driver_ids: [] }, drivers, shifts, trips, event)
      if (match) plan.proposals.push(assignmentProposal({ id: null, pickup_at: pickupAt, pickup_location: location, passenger_count: arrival.passenger_count }, arrival.delegation_name, match, drivers, event.timezone, index))
      else plan.alerts.push({ pickup_id: null, title: `No driver is free for ${arrival.delegation_name} at ${clock(pickupAt, event.timezone)}` })
      continue
    }
    if (!MOVABLE.has(pickup.status) || Math.abs(new Date(pickup.pickup_at).getTime() - new Date(pickupAt).getTime()) < MIN_CHANGE_MS) continue

    plan.pickup_times.push({ id: pickup.id, pickup_at: pickupAt, previous_pickup_at: pickup.pickup_at })
    trips = trips.map((trip) => (trip.pickup_id === pickup.id ? { ...trip, pickup_at: pickupAt } : trip))
    const match = matchDrivers({ pickup_id: pickup.id, pickup_at: pickupAt, kind: pickup.kind, passenger_count: pickup.passenger_count, current_driver_ids: pickup.driver_ids }, drivers, shifts, trips, event)
    const time = clock(pickupAt, event.timezone)

    const moved = `Pickup moves from ${clock(pickup.pickup_at, event.timezone)} to ${time}`
    if (pickup.driver_ids.length === 0) {
      if (match) plan.proposals.push({ ...assignmentProposal({ ...pickup, pickup_at: pickupAt }, arrival.delegation_name, match, drivers, event.timezone), also_changes: moved })
      else plan.alerts.push({ pickup_id: pickup.id, title: `No driver is free for ${arrival.delegation_name} at ${time}` })
    } else if (match?.kept) {
      plan.kept.push({ pickup_id: pickup.id, driver_ids: pickup.driver_ids, pickup_at: pickupAt })
    } else if (match) {
      plan.proposals.push({
        kind: 'driver_reassignment',
        pickup_id: pickup.id,
        new_pickup_index: null,
        title: `Reassign the ${time} pickup for ${arrival.delegation_name}`,
        summary: `${flight.flight_number} now lands ${clock(landing, event.timezone)} (${delayText(flight)}). ${names(pickup.driver_ids, drivers)} can no longer make the ${time} pickup; ${names(match.driver_ids, drivers)} can.`,
        driver_ids: match.driver_ids,
        alternatives: match.alternatives,
        also_changes: moved,
      })
      // The proposed driver is now spoken for while this plan is made.
      trips = [...trips.filter((trip) => trip.pickup_id !== pickup.id), ...match.driver_ids.map((driverId) => ({ pickup_id: pickup.id, driver_id: driverId, pickup_at: pickupAt, kind: pickup.kind }))]
    } else {
      plan.alerts.push({ pickup_id: pickup.id, title: `No driver can take the ${time} pickup for ${arrival.delegation_name}` })
    }
  }
  return plan
}
