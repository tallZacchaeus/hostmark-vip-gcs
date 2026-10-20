// Driver matching (FR-FT-06, 02-TRD.md §3.3). A driver can take a trip when they are active, one
// shift covers the whole trip window, and no other live trip overlaps it — the same rules the
// database re-checks on approval (private.driver_unavailability). Ranking keeps the current
// driver, then prefers the fewest jobs that day and the smallest idle gap; a party too big for
// one vehicle gets the fewest vehicles that seat everyone. Pure.

export type PickupKind = 'airport' | 'location'
export type Unavailability = 'inactive' | 'off_shift' | 'busy'

export interface MatchDriver {
  readonly id: string
  readonly full_name: string
  readonly vehicle_label: string | null
  readonly vehicle_capacity: number
  readonly is_active: boolean
}

export interface MatchShift {
  readonly driver_id: string
  readonly starts_at: string | Date
  readonly ends_at: string | Date
}

/** A live trip some driver is already on. */
export interface MatchTrip {
  readonly pickup_id: string
  readonly driver_id: string
  readonly pickup_at: string | Date
  readonly kind: PickupKind
}

export interface TravelTimes {
  readonly airport_travel_min: number
  readonly local_travel_min: number
}

export interface PickupNeed {
  readonly pickup_id: string
  readonly pickup_at: string | Date
  readonly kind: PickupKind
  readonly passenger_count: number
  readonly current_driver_ids: readonly string[]
}

export interface Window {
  readonly start: number
  readonly end: number
}

export interface Match {
  readonly driver_ids: string[]
  /** Up to two other single drivers who could take it. */
  readonly alternatives: string[]
  /** The current driver(s) can still do it at the new time. */
  readonly kept: boolean
}

const MINUTE = 60_000
const MAX_ALTERNATIVES = 2

export function tripWindow(pickupAt: string | Date, kind: PickupKind, travel: TravelTimes): Window {
  const at = new Date(pickupAt).getTime()
  const minutes = kind === 'airport' ? travel.airport_travel_min : travel.local_travel_min
  return { start: at - minutes * MINUTE, end: at + minutes * MINUTE }
}

const overlaps = (a: Window, b: Window): boolean => a.start < b.end && b.start < a.end

export function unavailability(
  driver: MatchDriver,
  window: Window,
  shifts: readonly MatchShift[],
  trips: readonly MatchTrip[],
  travel: TravelTimes,
  excludePickupId: string,
): Unavailability | null {
  if (!driver.is_active) return 'inactive'
  const covered = shifts.some(
    (shift) => shift.driver_id === driver.id && new Date(shift.starts_at).getTime() <= window.start && new Date(shift.ends_at).getTime() >= window.end,
  )
  if (!covered) return 'off_shift'
  const busy = trips.some((trip) => trip.driver_id === driver.id && trip.pickup_id !== excludePickupId && overlaps(tripWindow(trip.pickup_at, trip.kind, travel), window))
  return busy ? 'busy' : null
}

interface Candidate {
  readonly driver: MatchDriver
  readonly jobs: number
  readonly idleGap: number
}

function candidateOrder(need: PickupNeed) {
  return (a: Candidate, b: Candidate): number => {
    const current = Number(need.current_driver_ids.includes(b.driver.id)) - Number(need.current_driver_ids.includes(a.driver.id))
    if (current !== 0) return current
    if (a.jobs !== b.jobs) return a.jobs - b.jobs
    if (a.idleGap !== b.idleGap) return a.idleGap - b.idleGap
    // Do not send a bus for one passenger when a car will do.
    if (a.driver.vehicle_capacity !== b.driver.vehicle_capacity) return a.driver.vehicle_capacity - b.driver.vehicle_capacity
    return a.driver.full_name.localeCompare(b.driver.full_name)
  }
}

function describe(driver: MatchDriver, window: Window, trips: readonly MatchTrip[], travel: TravelTimes, excludePickupId: string): Candidate {
  const own = trips.filter((trip) => trip.driver_id === driver.id && trip.pickup_id !== excludePickupId)
  const before = own.map((trip) => tripWindow(trip.pickup_at, trip.kind, travel).end).filter((end) => end <= window.start)
  const idleGap = before.length ? window.start - Math.max(...before) : Number.POSITIVE_INFINITY
  return { driver, jobs: own.length, idleGap }
}

/** The best driver(s) for a pickup, or null when nobody (or no combination) can take it. */
export function matchDrivers(
  need: PickupNeed,
  drivers: readonly MatchDriver[],
  shifts: readonly MatchShift[],
  trips: readonly MatchTrip[],
  travel: TravelTimes,
): Match | null {
  const window = tripWindow(need.pickup_at, need.kind, travel)
  const feasible = drivers.filter((driver) => unavailability(driver, window, shifts, trips, travel, need.pickup_id) === null)

  const current = feasible.filter((driver) => need.current_driver_ids.includes(driver.id))
  const currentSeats = current.reduce((sum, driver) => sum + driver.vehicle_capacity, 0)
  if (need.current_driver_ids.length > 0 && current.length === need.current_driver_ids.length && currentSeats >= need.passenger_count) {
    return { driver_ids: current.map((driver) => driver.id), alternatives: [], kept: true }
  }

  const ranked = feasible.map((driver) => describe(driver, window, trips, travel, need.pickup_id)).sort(candidateOrder(need))
  const single = ranked.filter((candidate) => candidate.driver.vehicle_capacity >= need.passenger_count)
  if (single.length > 0) {
    const [best, ...others] = single
    return { driver_ids: [best?.driver.id ?? ''], alternatives: others.slice(0, MAX_ALTERNATIVES).map((candidate) => candidate.driver.id), kept: false }
  }

  // No vehicle is big enough: the fewest vehicles, biggest first, that seat everyone.
  const byCapacity = [...ranked].sort((a, b) => b.driver.vehicle_capacity - a.driver.vehicle_capacity)
  const chosen: string[] = []
  let seats = 0
  for (const candidate of byCapacity) {
    if (seats >= need.passenger_count) break
    chosen.push(candidate.driver.id)
    seats += candidate.driver.vehicle_capacity
  }
  return seats >= need.passenger_count ? { driver_ids: chosen, alternatives: [], kept: false } : null
}
