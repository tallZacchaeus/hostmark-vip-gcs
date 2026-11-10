// What the simulation screen reads from /api/simulation/*.
import type { IconName } from '@/components/ui/Icon'
import type { RunSummary } from '@/lib/repositories/simulation'
import type { WhatIfLineKind } from '@/lib/services/simulation/what-if'

export type { RunSummary } from '@/lib/repositories/simulation'
export type { WhatIfLine, WhatIfResult } from '@/lib/services/simulation/what-if'

export interface ScenarioOption {
  readonly key: string
  readonly title: string
  readonly description: string
  readonly steps: number
}

export interface SimulationOptions {
  readonly flight_mode: 'live' | 'simulated'
  readonly timezone: string
  readonly scenarios: ScenarioOption[]
  readonly flights: { readonly id: string; readonly flight_number: string; readonly scheduled_arrival_at: string | null; readonly delegations: string[] }[]
  readonly drivers: { readonly id: string; readonly full_name: string; readonly vehicle_label: string | null }[]
  /** Rooms in service with guests planned or checked in. */
  readonly rooms: { readonly id: string; readonly number: string; readonly guests: string[] }[]
}

export const LINE_ICONS: Readonly<Record<WhatIfLineKind, IconName>> = {
  time: 'clock',
  kept: 'check',
  proposal: 'sparkle',
  alert: 'alert',
  flag: 'plane',
}

/** What a run acts on, for its row: "EK783, Room 301, Okafor delegation". */
export const runTargets = (run: Pick<RunSummary, 'flight_numbers' | 'room_numbers' | 'delegations'>): string =>
  [...run.flight_numbers, ...run.room_numbers.map((number) => `Room ${number}`), ...run.delegations].join(', ')

/** Virtual seconds per real second offered for scripted runs. */
export const SPEEDS: readonly (readonly [number, string])[] = [
  [1, 'Real time'],
  [10, '10×'],
  [60, '60× (1 h per minute)'],
  [600, '600×'],
]
