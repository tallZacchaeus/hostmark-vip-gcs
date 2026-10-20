// The driver app's rules (Figma "Driver pickups", FR-FT-09): which trip is the big card, what its
// one button does next, and how the day splits into later, moved and done. Pure.
import { formatDelay, formatTime } from '@/lib/client/format'
import type { DriverPassenger, DriverTrip, TripStatus } from '@/lib/repositories/driver-app'

export type { DriverTrip, TripStatus } from '@/lib/repositories/driver-app'

export interface DriverDay {
  readonly hero: DriverTrip | null
  readonly later: DriverTrip[]
  readonly moved: DriverTrip[]
  readonly done: DriverTrip[]
}

const isOpen = (trip: DriverTrip): boolean => trip.status === 'active' && trip.pickup_status !== 'completed' && trip.pickup_status !== 'cancelled'

/** The trip under way, else the next one; the rest are later, moved away or done. */
export function splitDay(trips: readonly DriverTrip[]): DriverDay {
  const open = trips.filter(isOpen)
  const hero = open.find((trip) => Boolean(trip.en_route_at)) ?? open[0] ?? null
  return {
    hero,
    later: open.filter((trip) => trip !== hero),
    moved: trips.filter((trip) => trip.status === 'released'),
    done: trips.filter((trip) => trip.status === 'completed'),
  }
}

export interface NextStep {
  readonly status: TripStatus
  readonly label: string
}

/** Start → Picked up → Dropped off (the database accepts them in that order). */
export function nextStep(trip: DriverTrip): NextStep {
  if (!trip.en_route_at) return { status: 'en_route', label: 'Start pickup' }
  if (!trip.picked_up_at) return { status: 'picked_up', label: 'Picked up' }
  return { status: 'completed', label: 'Dropped off' }
}

export function progressLabel(trip: DriverTrip): string | null {
  if (trip.picked_up_at) return 'Picked up'
  if (trip.en_route_at) return 'On the way'
  return null
}

/** What changed and is not confirmed yet: a moved time or a new trip. */
export function changeNotice(trip: DriverTrip, timeZone: string): string | null {
  if (trip.acknowledged_at) return null
  if (trip.previous_pickup_at && trip.previous_pickup_at !== trip.pickup_at) return `Time changed from ${formatTime(trip.previous_pickup_at, timeZone)}.`
  return 'New pickup for you.'
}

export function flightStatus(trip: DriverTrip): { readonly label: string; readonly landed: boolean } | null {
  if (!trip.flight_number) return null
  if (trip.flight_phase === 'landed') return { label: 'Landed', landed: true }
  if (trip.flight_phase === 'cancelled' || trip.flight_phase === 'diverted') return { label: trip.flight_phase === 'cancelled' ? 'Cancelled' : 'Diverted', landed: false }
  if (trip.delay_minutes && trip.delay_minutes > 0) return { label: `Delayed ${formatDelay(trip.delay_minutes)}`, landed: false }
  return { label: trip.flight_phase === 'in_air' ? 'In the air' : 'On time', landed: false }
}

export const personName = (person: Pick<DriverPassenger, 'title' | 'full_name'>): string => [person.title, person.full_name].filter(Boolean).join(' ') || 'Guest'

/** "Bishop Okafor +3" */
export function partyLabel(trip: DriverTrip): string {
  const others = trip.passenger_count - 1
  const name = personName(trip.principal)
  return others > 0 ? `${name} +${others}` : name
}
