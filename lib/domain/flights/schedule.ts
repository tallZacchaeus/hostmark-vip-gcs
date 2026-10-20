// Flight timing rules (FR-FT-02/03, 02-TRD.md §3.2): the best-known arrival time, the delayed
// badge, and adaptive polling — checked more often as the arrival approaches, to stay within the
// flight API's quota. Pure: the caller passes "now".

export const FLIGHT_PHASES = ['scheduled', 'in_air', 'landed', 'cancelled', 'diverted', 'unknown'] as const
export type FlightPhase = (typeof FLIGHT_PHASES)[number]

/** Phases after which a flight is not checked again. */
export const FINAL_PHASES: ReadonlySet<FlightPhase> = new Set(['landed', 'cancelled', 'diverted'])

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const UNSCHEDULED_RECHECK = 6 * HOUR

/** Adaptive polling (FR-FT-03): [time to arrival above, check interval]. */
const POLLING: ReadonlyArray<readonly [number, number]> = [
  [6 * HOUR, 2 * HOUR],
  [2 * HOUR, 30 * MINUTE],
  [Number.NEGATIVE_INFINITY, 10 * MINUTE],
]
const FIRST_CHECK_BEFORE = 24 * HOUR

export interface FlightTimes {
  readonly scheduled_arrival_at: string | Date | null
  readonly estimated_arrival_at: string | Date | null
  readonly actual_arrival_at: string | Date | null
  readonly manual_arrival_at: string | Date | null
}

const ms = (value: string | Date | null): number | null => (value === null ? null : new Date(value).getTime())

/** Manual override wins, then the actual, the estimated and the scheduled time. */
export function effectiveArrival(flight: FlightTimes): Date | null {
  const best = ms(flight.manual_arrival_at) ?? ms(flight.actual_arrival_at) ?? ms(flight.estimated_arrival_at) ?? ms(flight.scheduled_arrival_at)
  return best === null ? null : new Date(best)
}

/** Minutes late against the schedule (negative when early); null without a schedule. */
export function delayMinutes(flight: FlightTimes): number | null {
  const scheduled = ms(flight.scheduled_arrival_at)
  const best = effectiveArrival(flight)
  return scheduled === null || best === null ? null : Math.round((best.getTime() - scheduled) / MINUTE)
}

export function isDelayed(delay: number | null, thresholdMinutes: number): boolean {
  return delay !== null && delay > thresholdMinutes
}

/** When to check this flight next; null once it has landed or been cancelled/diverted. */
export function nextCheckAt(now: Date, arrival: Date | null, phase: FlightPhase): Date | null {
  if (FINAL_PHASES.has(phase)) return null
  if (!arrival) return new Date(now.getTime() + UNSCHEDULED_RECHECK)
  const untilArrival = arrival.getTime() - now.getTime()
  if (untilArrival > FIRST_CHECK_BEFORE) return new Date(arrival.getTime() - FIRST_CHECK_BEFORE)
  const [, interval] = POLLING.find(([above]) => untilArrival > above) ?? [0, 10 * MINUTE]
  return new Date(now.getTime() + interval)
}
