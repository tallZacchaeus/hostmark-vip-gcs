// Which flight provider the event uses (02-TRD.md §3.2): simulated mode always has one; live mode
// only with an AeroDataBox key — without it, nothing is called and times change only by hand.
import { createAeroDataBoxProvider } from '@/lib/flights/aerodatabox-provider'
import type { FlightProvider } from '@/lib/flights/provider'
import { simulatedProvider } from '@/lib/flights/simulated-provider'

export interface ProviderEvent {
  readonly flight_mode: 'live' | 'simulated'
  readonly arrival_airports: readonly string[]
}

export function flightProviderFor(event: ProviderEvent, aeroDataBoxKey: string | undefined): FlightProvider | null {
  if (event.flight_mode === 'simulated') return simulatedProvider
  return aeroDataBoxKey ? createAeroDataBoxProvider(aeroDataBoxKey, event.arrival_airports) : null
}
