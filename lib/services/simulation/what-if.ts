// What-if previews for the simulation screen: what would happen if a flight were late, a driver
// dropped out or a room went out of service — computed with the same planner, matcher and room
// re-planning the live system uses, and never written anywhere. Runs as the coordinator (reads only, under row-level security).
import { sql } from 'kysely'
import { ApiError } from '@/lib/api/errors'
import type { Tx } from '@/lib/db/context'
import { type CascadePlan, clock, planCascade } from '@/lib/domain/transport/cascade'
import { type MatchDriver, type MatchTrip, type PickupKind, matchDrivers, tripWindow } from '@/lib/domain/transport/matcher'
import { ROOM_CHANGED, type StayOutcome, outcomeText, planStayMoves, withRoomOutOfService } from '@/lib/services/rooms/moves'
import { type TransportContext, loadFlightParties, loadTransportContext } from '@/lib/services/transport/context'

export type WhatIfInput =
  | { readonly kind: 'flight_delay'; readonly flight_id: string; readonly minutes: number }
  | { readonly kind: 'driver_unavailable'; readonly driver_id: string; readonly from?: string }
  | { readonly kind: 'room_out_of_service'; readonly room_id: string }

export type WhatIfLineKind = 'time' | 'kept' | 'proposal' | 'alert' | 'flag'

export interface WhatIfLine {
  readonly kind: WhatIfLineKind
  readonly title: string
  readonly detail: string | null
}

export interface WhatIfResult {
  readonly headline: string
  /** How many decisions a coordinator would be asked to make. */
  readonly decisions: number
  readonly lines: WhatIfLine[]
}

const MINUTE = 60_000

/** "1 decision", "3 decisions" */
const count = (n: number, singular: string, pluralForm = `${singular}s`): string => `${n} ${n === 1 ? singular : pluralForm}`

const names = (ids: readonly string[], drivers: readonly MatchDriver[]): string =>
  ids.map((id) => drivers.find((driver) => driver.id === id)?.full_name ?? 'a driver').join(' and ')

function planLines(plan: CascadePlan, delegationOf: (arrivalId: string) => string, pickupArrival: Map<string, string>, context: TransportContext): WhatIfLine[] {
  const tz = context.event.timezone
  return [
    ...plan.arrivals.filter((arrival) => arrival.attention).map((arrival) => ({ kind: 'flag' as const, title: `${delegationOf(arrival.id)}: ${arrival.attention}`, detail: null })),
    ...plan.pickup_times.map((pickup) => ({
      kind: 'time' as const,
      title: `${delegationOf(pickupArrival.get(pickup.id) ?? '')} pickup moves ${clock(pickup.previous_pickup_at, tz)} → ${clock(pickup.pickup_at, tz)}`,
      detail: null,
    })),
    ...plan.new_pickups.map((pickup) => ({ kind: 'time' as const, title: `New pickup for ${delegationOf(pickup.arrival_id)} at ${clock(pickup.pickup_at, tz)}`, detail: pickup.pickup_location })),
    ...plan.kept.map((kept) => ({
      kind: 'kept' as const,
      title: `${names(kept.driver_ids, context.drivers)} keeps the ${clock(kept.pickup_at, tz)} pickup`,
      detail: 'Told automatically; confirms again in the driver app',
    })),
    ...plan.proposals.map((proposal) => ({ kind: 'proposal' as const, title: proposal.title, detail: proposal.summary })),
    ...plan.alerts.map((alert) => ({ kind: 'alert' as const, title: alert.title, detail: null })),
  ]
}

async function previewFlightDelay(tx: Tx, flightId: string, minutes: number): Promise<WhatIfResult> {
  const context = await loadTransportContext(tx)
  const parties = await loadFlightParties(tx, flightId)
  const scheduled = parties.flight.scheduled_arrival_at
  if (!scheduled) throw new ApiError(409, 'no_schedule', 'This flight has no scheduled arrival time yet')
  const flight = {
    ...parties.flight,
    phase: 'in_air' as const,
    estimated_arrival_at: new Date(new Date(scheduled).getTime() + minutes * MINUTE).toISOString(),
    actual_arrival_at: null,
    manual_arrival_at: null,
  }
  const plan = planCascade({ event: context.event, ...parties, flight, drivers: context.drivers, shifts: context.shifts, trips: context.trips })
  const delegation = new Map(parties.arrivals.map((arrival) => [arrival.id, arrival.delegation_name]))
  const pickupArrival = new Map(parties.pickups.map((pickup) => [pickup.id, pickup.arrival_id]))
  const lines = planLines(plan, (id) => delegation.get(id) ?? 'A party', pickupArrival, context)
  const late = minutes === 0 ? 'on time' : minutes > 0 ? `${minutes} min late` : `${-minutes} min early`
  return {
    headline: `${parties.flight.flight_number} ${late}: ${count(plan.pickup_times.length + plan.new_pickups.length, 'pickup change')}, ${count(plan.proposals.length, 'decision')}`,
    decisions: plan.proposals.length,
    lines,
  }
}

interface TripRow {
  readonly id: string
  readonly kind: PickupKind
  readonly pickup_at: Date
  readonly passenger_count: number
  readonly delegation_name: string
}

async function driverTrips(tx: Tx, pickupIds: readonly string[]): Promise<TripRow[]> {
  if (pickupIds.length === 0) return []
  const { rows } = await sql<TripRow>`
    select p.id, p.kind, p.pickup_at, p.passenger_count, d.name as delegation_name
    from public.pickups p
    join public.arrivals a on a.id = p.arrival_id
    join public.delegations d on d.id = a.delegation_id
    where p.id = any (${[...pickupIds]}::uuid[]) and p.status in ('pending_assignment', 'assigned')
    order by p.pickup_at`.execute(tx)
  return rows
}

function replacementLine(trip: TripRow, driverId: string, drivers: readonly MatchDriver[], context: TransportContext, trips: MatchTrip[]): { line: WhatIfLine; trips: MatchTrip[] } {
  const time = clock(trip.pickup_at, context.event.timezone)
  const pickupAt = new Date(trip.pickup_at).toISOString()
  const others = context.trips.filter((item) => item.pickup_id === trip.id && item.driver_id !== driverId).map((item) => item.driver_id)
  const need = { pickup_id: trip.id, pickup_at: pickupAt, kind: trip.kind, passenger_count: trip.passenger_count, current_driver_ids: others }
  const match = matchDrivers(need, drivers, context.shifts, trips, context.event)
  if (!match) return { line: { kind: 'alert', title: `Nobody can take the ${time} pickup for ${trip.delegation_name}`, detail: null }, trips }
  if (match.kept) return { line: { kind: 'kept', title: `${names(others, drivers)} still cover the ${time} pickup for ${trip.delegation_name}`, detail: null }, trips }
  const line: WhatIfLine = {
    kind: 'proposal',
    title: `Reassign the ${time} pickup for ${trip.delegation_name}`,
    detail: `Best match: ${names(match.driver_ids, drivers)}${match.alternatives.length ? `; also possible: ${names(match.alternatives, drivers)}` : ''}.`,
  }
  // Later trips must see the replacement as busy.
  const taken = match.driver_ids.map((id) => ({ pickup_id: trip.id, driver_id: id, pickup_at: pickupAt, kind: trip.kind }))
  return { line, trips: [...trips.filter((item) => !(item.pickup_id === trip.id && item.driver_id === driverId)), ...taken] }
}

/** The driver drops out from `from` (default: now on): trips that end before it are not affected. */
async function previewDriverUnavailable(tx: Tx, driverId: string, from: string | undefined): Promise<WhatIfResult> {
  const context = await loadTransportContext(tx)
  const driver = context.drivers.find((item) => item.id === driverId)
  if (!driver) throw new ApiError(404, 'not_found', 'Driver not found')
  const drivers = context.drivers.map((item) => (item.id === driverId ? { ...item, is_active: false } : item))
  const rows = await driverTrips(tx, context.trips.filter((trip) => trip.driver_id === driverId).map((trip) => trip.pickup_id))
  const start = from ? new Date(from).getTime() : Number.NEGATIVE_INFINITY
  const affected = rows.filter((row) => tripWindow(row.pickup_at, row.kind, context.event).end > start)
  let trips: MatchTrip[] = context.trips
  const lines: WhatIfLine[] = rows
    .filter((row) => !affected.includes(row))
    .map((row) => ({ kind: 'kept' as const, title: `The ${clock(row.pickup_at, context.event.timezone)} pickup for ${row.delegation_name} is not affected`, detail: null }))
  for (const row of affected) {
    const next = replacementLine(row, driverId, drivers, context, trips)
    lines.push(next.line)
    trips = next.trips
  }
  const decisions = lines.filter((line) => line.kind === 'proposal').length
  return {
    headline: affected.length === 0 ? `${driver.full_name} unavailable: no trips affected` : `${driver.full_name} unavailable: ${count(affected.length, 'trip')} affected, ${count(decisions, 'decision')}`,
    decisions,
    lines,
  }
}

const outcomeLine = (outcome: StayOutcome): WhatIfLine => {
  const text = outcomeText(outcome, ROOM_CHANGED)
  return { kind: outcome.kind === 'move' ? 'proposal' : 'alert', title: text.title, detail: text.detail }
}

/** The room goes out of service now: its stays are re-planned in memory, as reworkRoom would. */
async function previewRoomOutOfService(tx: Tx, roomId: string): Promise<WhatIfResult> {
  const room = await tx.selectFrom('rooms').select('number').where('id', '=', roomId).executeTakeFirst()
  if (!room) throw new ApiError(404, 'not_found', 'Room not found')
  const outcomes = await planStayMoves(tx, (stay) => stay.room_id === roomId, new Date(), withRoomOutOfService(roomId))
  const decisions = outcomes.filter((outcome) => outcome.kind === 'move').length
  return {
    headline:
      outcomes.length === 0
        ? `Room ${room.number} out of service: no guests affected`
        : `Room ${room.number} out of service: ${count(outcomes.length, 'guest')} affected, ${count(decisions, 'decision')}`,
    decisions,
    lines: outcomes.map(outcomeLine),
  }
}

export async function previewWhatIf(tx: Tx, input: WhatIfInput): Promise<WhatIfResult> {
  switch (input.kind) {
    case 'flight_delay':
      return previewFlightDelay(tx, input.flight_id, input.minutes)
    case 'driver_unavailable':
      return previewDriverUnavailable(tx, input.driver_id, input.from)
    case 'room_out_of_service':
      return previewRoomOutOfService(tx, input.room_id)
  }
}
