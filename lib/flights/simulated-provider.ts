// Simulated flight status: times stay as they are (scenarios change them through the same
// ingestion as live data); only the phase moves with the clock — scheduled until three hours
// before arrival, in the air until it, landed after.
import { FINAL_PHASES, effectiveArrival } from '@/lib/domain/flights/schedule'
import { type FlightProvider, type FlightSnapshot, type TrackedFlight, iso } from './provider'

const FLIGHT_TIME_MS = 3 * 60 * 60_000

export function simulatedSnapshot(flight: TrackedFlight, now: Date): FlightSnapshot {
  const base = {
    scheduled_arrival_at: iso(flight.scheduled_arrival_at),
    estimated_arrival_at: iso(flight.estimated_arrival_at),
    actual_arrival_at: iso(flight.actual_arrival_at),
    origin_iata: flight.origin_iata,
    destination_iata: flight.destination_iata,
  }
  const arrival = effectiveArrival(flight)
  if (FINAL_PHASES.has(flight.phase) || !arrival) return { ...base, phase: arrival ? flight.phase : 'unknown' }
  if (now.getTime() >= arrival.getTime()) return { ...base, phase: 'landed', actual_arrival_at: base.actual_arrival_at ?? arrival.toISOString() }
  return { ...base, phase: now.getTime() >= arrival.getTime() - FLIGHT_TIME_MS ? 'in_air' : 'scheduled' }
}

export const simulatedProvider: FlightProvider = {
  name: 'simulated',
  async getStatus(flight, now) {
    return simulatedSnapshot(flight, now)
  },
}
