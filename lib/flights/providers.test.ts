import { describe, expect, it, vi } from 'vitest'
import { createAeroDataBoxProvider, toSnapshot } from './aerodatabox-provider'
import type { TrackedFlight } from './provider'
import { simulatedSnapshot } from './simulated-provider'

const FLIGHT: TrackedFlight = {
  flight_number: 'EK783',
  arrival_date_local: '2026-10-28',
  phase: 'scheduled',
  scheduled_arrival_at: '2026-10-28T12:40:00Z',
  estimated_arrival_at: '2026-10-28T13:25:00Z',
  actual_arrival_at: null,
  manual_arrival_at: null,
  origin_iata: 'DXB',
  destination_iata: 'LOS',
}

describe('simulatedSnapshot', () => {
  it('moves the phase with the clock and keeps the times', () => {
    expect(simulatedSnapshot(FLIGHT, new Date('2026-10-28T08:00:00Z'))).toMatchObject({ phase: 'scheduled', estimated_arrival_at: '2026-10-28T13:25:00.000Z' })
    expect(simulatedSnapshot(FLIGHT, new Date('2026-10-28T11:00:00Z')).phase).toBe('in_air')
    expect(simulatedSnapshot(FLIGHT, new Date('2026-10-28T13:30:00Z'))).toMatchObject({ phase: 'landed', actual_arrival_at: '2026-10-28T13:25:00.000Z' })
  })

  it('never reopens a finished flight', () => {
    expect(simulatedSnapshot({ ...FLIGHT, phase: 'cancelled' }, new Date('2026-10-28T08:00:00Z')).phase).toBe('cancelled')
  })
})

const API_FLIGHT = {
  status: 'EnRoute',
  departure: { airport: { iata: 'DXB' } },
  arrival: { airport: { iata: 'LOS' }, scheduledTime: { utc: '2026-10-28 12:40Z' }, revisedTime: { utc: '2026-10-28 13:25Z' } },
}

describe('AeroDataBox', () => {
  it('maps the response to a snapshot', () => {
    expect(toSnapshot(API_FLIGHT)).toMatchObject({
      phase: 'in_air',
      scheduled_arrival_at: '2026-10-28T12:40:00.000Z',
      estimated_arrival_at: '2026-10-28T13:25:00.000Z',
      actual_arrival_at: null,
      origin_iata: 'DXB',
      destination_iata: 'LOS',
    })
    expect(toSnapshot({ status: 'Arrived', arrival: { runwayTime: { utc: '2026-10-28 13:20Z' } } })).toMatchObject({ phase: 'landed', actual_arrival_at: '2026-10-28T13:20:00.000Z' })
    expect(toSnapshot({ status: 'Something new' }).phase).toBe('unknown')
  })

  it('asks for the flight by number and date and picks the leg landing at the event airport', async () => {
    const other = { ...API_FLIGHT, arrival: { ...API_FLIGHT.arrival, airport: { iata: 'ACC' } } }
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => [other, API_FLIGHT] }))
    const snapshot = await createAeroDataBoxProvider('key', ['LOS'], fetchFn).getStatus(FLIGHT, new Date())

    expect(snapshot?.destination_iata).toBe('LOS')
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://aerodatabox.p.rapidapi.com/flights/number/EK783/2026-10-28')
    expect(new Headers(init.headers).get('X-RapidAPI-Key')).toBe('key')
  })

  it('treats an unknown flight as no data and an API error as a failure', async () => {
    const missing = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }))
    expect(await createAeroDataBoxProvider('key', ['LOS'], missing).getStatus(FLIGHT, new Date())).toBeNull()
    const failing = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }))
    await expect(createAeroDataBoxProvider('key', ['LOS'], failing).getStatus(FLIGHT, new Date())).rejects.toThrow('429')
  })
})
