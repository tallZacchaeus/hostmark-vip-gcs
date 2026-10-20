// AeroDataBox (02-TRD.md §4.1): GET /flights/number/{number}/{date} on RapidAPI. Used only in
// live mode with AERODATABOX_API_KEY. The response is validated loosely and mapped to a snapshot;
// verify the field names against a few real flights before the evaluation month (TRD §4.1).
import { z } from 'zod'
import type { FlightPhase } from '@/lib/domain/flights/schedule'
import type { FlightProvider, FlightSnapshot } from './provider'

const BASE_URL = 'https://aerodatabox.p.rapidapi.com'
const HOST = 'aerodatabox.p.rapidapi.com'
const TIMEOUT_MS = 10_000

const time = z.object({ utc: z.string() }).partial().optional()
const leg = z
  .object({
    airport: z.object({ iata: z.string().optional() }).partial().optional(),
    scheduledTime: time,
    revisedTime: time,
    predictedTime: time,
    runwayTime: time,
  })
  .partial()
const flightSchema = z.object({ status: z.string().optional(), departure: leg.optional(), arrival: leg.optional() }).passthrough()
const responseSchema = z.array(flightSchema)

type ApiFlight = z.infer<typeof flightSchema>

const PHASES: Readonly<Record<string, FlightPhase>> = {
  arrived: 'landed',
  canceled: 'cancelled',
  canceleduncertain: 'cancelled',
  diverted: 'diverted',
  enroute: 'in_air',
  departed: 'in_air',
  approaching: 'in_air',
  expected: 'scheduled',
  checkin: 'scheduled',
  boarding: 'scheduled',
  gateclosed: 'scheduled',
  delayed: 'scheduled',
}

/** "2026-10-28 12:40Z" → ISO; null when absent or unreadable. */
function utc(value: { utc?: string } | undefined): string | null {
  if (!value?.utc) return null
  const parsed = new Date(value.utc.replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function toSnapshot(flight: ApiFlight): FlightSnapshot {
  const phase = PHASES[(flight.status ?? '').toLowerCase()] ?? 'unknown'
  const arrival = flight.arrival ?? {}
  return {
    phase,
    scheduled_arrival_at: utc(arrival.scheduledTime),
    estimated_arrival_at: utc(arrival.revisedTime) ?? utc(arrival.predictedTime),
    actual_arrival_at: phase === 'landed' ? (utc(arrival.runwayTime) ?? utc(arrival.revisedTime)) : null,
    origin_iata: flight.departure?.airport?.iata ?? null,
    destination_iata: arrival.airport?.iata ?? null,
    payload: flight,
  }
}

type FetchLike = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>

export function createAeroDataBoxProvider(apiKey: string, arrivalAirports: readonly string[], fetchFn: FetchLike = fetch): FlightProvider {
  return {
    name: 'aerodatabox',
    async getStatus(flight) {
      const url = `${BASE_URL}/flights/number/${encodeURIComponent(flight.flight_number)}/${flight.arrival_date_local}`
      const response = await fetchFn(url, {
        headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': HOST },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (response.status === 404 || response.status === 204) return null
      if (!response.ok) throw new Error(`AeroDataBox answered ${response.status}`)
      const flights = responseSchema.parse(await response.json())
      // A flight number can have several legs a day: take the one landing at the event's airport.
      const ours = flights.find((item) => arrivalAirports.includes(item.arrival?.airport?.iata ?? '')) ?? flights[0]
      return ours ? toSnapshot(ours) : null
    },
  }
}
