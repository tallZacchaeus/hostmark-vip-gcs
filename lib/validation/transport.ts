// Request shapes for flights, transport, the driver app and simulation (P3). Limits mirror the
// database: simulation speed 1–3600, trip statuses as set_trip_status accepts them.
import { z } from 'zod'
import { SCENARIO_KEYS } from '@/lib/domain/simulation/scenarios'
import { blankToUndefined, intInRange, uuidSchema } from './common'

const isoInstant = z.iso.datetime({ offset: true, message: 'Use a date and time with a time zone, e.g. 2026-11-20T14:55:00+01:00' })

/** ?day=2026-11-20 (event time zone); absent means "today, or the next day with arrivals". */
export const dayQuerySchema = z.object({ day: z.preprocess(blankToUndefined, z.iso.date('Use a date like 2026-11-20').optional()) })
export type DayQuery = z.infer<typeof dayQuerySchema>

/** A coordinator's own landing time for a flight (FR-FT-11); null clears it. */
export const flightOverrideSchema = z.object({ manual_arrival_at: isoInstant.nullable() })
export type FlightOverride = z.infer<typeof flightOverrideSchema>

export const TRIP_STATUSES = ['en_route', 'picked_up', 'completed'] as const
export const tripStatusSchema = z.object({ status: z.enum(TRIP_STATUSES) })

export const SIMULATION_SPEEDS = [1, 10, 60, 600] as const
export const simulationStartSchema = z.object({
  scenario_key: z.enum(SCENARIO_KEYS, 'Choose a scenario'),
  speed: intInRange(1, 3600).default(60),
})

/** Late or early by up to 12 hours either way. */
const MAX_SHIFT_MIN = 720

export const whatIfSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('flight_delay'), flight_id: uuidSchema, minutes: intInRange(-MAX_SHIFT_MIN, MAX_SHIFT_MIN) }),
  z.object({ kind: z.literal('driver_unavailable'), driver_id: uuidSchema, from: isoInstant.optional() }),
  z.object({ kind: z.literal('room_out_of_service'), room_id: uuidSchema }),
])
