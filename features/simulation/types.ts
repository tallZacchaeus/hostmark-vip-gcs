// What the simulation screen reads from /api/simulation/*.
import type { IconName } from '@/components/ui/Icon'
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
}

export const LINE_ICONS: Readonly<Record<WhatIfLineKind, IconName>> = {
  time: 'clock',
  kept: 'check',
  proposal: 'sparkle',
  alert: 'alert',
  flag: 'plane',
}

/** Virtual seconds per real second offered for scripted runs. */
export const SPEEDS: readonly (readonly [number, string])[] = [
  [1, 'Real time'],
  [10, '10×'],
  [60, '60× (1 h per minute)'],
  [600, '600×'],
]
