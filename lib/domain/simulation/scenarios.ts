// Scripted flight scenarios for simulated mode (FR-PL-10, FR-FT-10). They are versioned with the
// code, not stored in the database. A run fixes which flights it acts on when it starts (the next
// flights to land); each step then changes one of them at a virtual time, through the same
// ingestion as live data. Pure.
import { effectiveArrival } from '@/lib/domain/flights/schedule'
import type { FlightSnapshot, TrackedFlight } from '@/lib/flights/provider'
import { iso } from '@/lib/flights/provider'

export type FlightChange =
  | { readonly kind: 'delay'; readonly minutes: number }
  | { readonly kind: 'early'; readonly minutes: number }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'divert' }
  | { readonly kind: 'land' }

export interface ScenarioStep {
  /** Virtual minutes after the run starts. */
  readonly at_min: number
  /** Which of the run's flights: 0 is the next to land. */
  readonly flight: number
  readonly change: FlightChange
}

export interface Scenario {
  readonly key: string
  readonly title: string
  readonly description: string
  /** Sorted by at_min. */
  readonly steps: readonly ScenarioStep[]
}

export const SCENARIOS: readonly Scenario[] = [
  {
    key: 'single-delay',
    title: 'One flight 45 minutes late',
    description: 'The next flight to land is delayed by 45 minutes: pickups move, and a driver who can no longer make it gets a replacement proposal.',
    steps: [{ at_min: 0, flight: 0, change: { kind: 'delay', minutes: 45 } }],
  },
  {
    key: 'rolling-delays',
    title: 'Rolling delays',
    description: 'A flight slips twice (30, then 75 minutes) while a second flight is delayed 50 minutes, so drivers compete for the same window.',
    steps: [
      { at_min: 0, flight: 0, change: { kind: 'delay', minutes: 30 } },
      { at_min: 10, flight: 0, change: { kind: 'delay', minutes: 75 } },
      { at_min: 20, flight: 1, change: { kind: 'delay', minutes: 50 } },
    ],
  },
  {
    key: 'early-arrival',
    title: 'Early arrival',
    description: 'The next flight lands 25 minutes early; its pickup moves forward and the driver must still be free.',
    steps: [
      { at_min: 0, flight: 0, change: { kind: 'early', minutes: 25 } },
      { at_min: 30, flight: 0, change: { kind: 'land' } },
    ],
  },
  {
    key: 'cancellation',
    title: 'Cancelled flight',
    description: 'The next flight is cancelled: its parties are flagged and releasing their pickups is proposed.',
    steps: [{ at_min: 0, flight: 0, change: { kind: 'cancel' } }],
  },
  {
    key: 'busy-morning',
    title: 'Busy morning',
    description: 'Three flights at once: one delayed an hour, one 20 minutes early, one diverted.',
    steps: [
      { at_min: 0, flight: 0, change: { kind: 'delay', minutes: 60 } },
      { at_min: 5, flight: 1, change: { kind: 'early', minutes: 20 } },
      { at_min: 15, flight: 2, change: { kind: 'divert' } },
    ],
  },
]

export const SCENARIO_KEYS = SCENARIOS.map((scenario) => scenario.key) as [string, ...string[]]

export const findScenario = (key: string): Scenario | undefined => SCENARIOS.find((scenario) => scenario.key === key)

/** How many flights the scenario needs. */
export const flightsNeeded = (scenario: Scenario): number => Math.max(...scenario.steps.map((step) => step.flight)) + 1

const MINUTE = 60_000

/** The flight after the change. Delays and early arrivals count from the scheduled time. */
export function applyChange(flight: TrackedFlight, change: FlightChange): FlightSnapshot {
  const base: FlightSnapshot = {
    // Leave the phase to the provider unless the step decides it.
    phase: 'unknown',
    scheduled_arrival_at: iso(flight.scheduled_arrival_at),
    estimated_arrival_at: iso(flight.estimated_arrival_at),
    actual_arrival_at: iso(flight.actual_arrival_at),
    origin_iata: flight.origin_iata,
    destination_iata: flight.destination_iata,
  }
  const scheduled = flight.scheduled_arrival_at ? new Date(flight.scheduled_arrival_at).getTime() : null
  switch (change.kind) {
    case 'delay':
    case 'early': {
      if (scheduled === null) return base
      const sign = change.kind === 'delay' ? 1 : -1
      return { ...base, estimated_arrival_at: new Date(scheduled + sign * change.minutes * MINUTE).toISOString() }
    }
    case 'cancel':
      return { ...base, phase: 'cancelled' }
    case 'divert':
      return { ...base, phase: 'diverted' }
    case 'land':
      return { ...base, phase: 'landed', actual_arrival_at: base.actual_arrival_at ?? effectiveArrival(flight)?.toISOString() ?? null }
  }
}

export interface RunClock {
  readonly real_start: string | Date
  readonly speed: number
}

/** Virtual minutes elapsed in a run. */
export const elapsedMinutes = (run: RunClock, now: Date): number => Math.max(0, ((now.getTime() - new Date(run.real_start).getTime()) * run.speed) / MINUTE)

/** The steps due now that have not been applied yet (steps_applied counts from the start). */
export function dueSteps(scenario: Scenario, run: RunClock & { readonly steps_applied: number }, now: Date): ScenarioStep[] {
  const elapsed = elapsedMinutes(run, now)
  return scenario.steps.slice(run.steps_applied).filter((step) => step.at_min <= elapsed)
}

export function describeChange(change: FlightChange): string {
  switch (change.kind) {
    case 'delay':
      return `delayed ${change.minutes} min`
    case 'early':
      return `${change.minutes} min early`
    case 'cancel':
      return 'cancelled'
    case 'divert':
      return 'diverted'
    case 'land':
      return 'lands'
  }
}
