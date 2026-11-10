// The driver's own trips for a day (FR-FT-09). ?day=YYYY-MM-DD in the event time zone, default
// today. Only drivers linked to an active driver record get trips (403 otherwise). Carries the
// coordination desk phone for the app's "Call coordinator" (null when the event has none).
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { systemClock } from '@/lib/domain/clock'
import { zonedDateKey } from '@/lib/domain/time'
import { findEventContext } from '@/lib/repositories/event'
import { myPickups } from '@/lib/repositories/driver-app'
import { dayQuerySchema } from '@/lib/validation/transport'

export const GET = defineRoute({ roles: ['driver'], query: dayQuerySchema }, async ({ query, asActor }) => {
  const result = await asActor(async (tx) => {
    const event = await findEventContext(tx)
    const day = query.day ?? zonedDateKey(systemClock.now(), event?.timezone ?? 'UTC')
    const trips = await myPickups(tx, day)
    return { day, timezone: event?.timezone ?? 'UTC', coordinator_phone: event?.coordinator_phone ?? null, trips }
  })
  return jsonOk(result)
})
