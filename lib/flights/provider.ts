// Where flight status comes from (FR-FT-10, 02-TRD.md §3.2). One interface; the event's flight
// mode picks the implementation: the simulated provider (development, demos) or AeroDataBox (live,
// only when AERODATABOX_API_KEY is set). Without a key, live mode has no provider and the worker
// leaves flights as they are.
import type { FlightPhase } from '@/lib/domain/flights/schedule'

export interface FlightSnapshot {
  readonly phase: FlightPhase
  readonly scheduled_arrival_at: string | null
  readonly estimated_arrival_at: string | null
  readonly actual_arrival_at: string | null
  readonly origin_iata: string | null
  readonly destination_iata: string | null
  /** Only for coordinator overrides (source "manual"); null clears the override. */
  readonly manual_arrival_at?: string | null
  readonly payload?: unknown
}

export interface TrackedFlight {
  readonly flight_number: string
  readonly arrival_date_local: string
  readonly phase: FlightPhase
  readonly scheduled_arrival_at: string | Date | null
  readonly estimated_arrival_at: string | Date | null
  readonly actual_arrival_at: string | Date | null
  readonly manual_arrival_at: string | Date | null
  readonly origin_iata: string | null
  readonly destination_iata: string | null
}

export interface FlightProvider {
  readonly name: 'simulated' | 'aerodatabox'
  /** The flight's current state, or null when the provider does not know it. */
  getStatus(flight: TrackedFlight, now: Date): Promise<FlightSnapshot | null>
}

export const iso = (value: string | Date | null): string | null => (value === null ? null : new Date(value).toISOString())
