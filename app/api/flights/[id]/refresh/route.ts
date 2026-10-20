// "Check now" (FR-FT-02): asks the event's flight provider about one flight straight away and
// applies the answer through the normal ingestion. Live calls count towards the daily limit.
import { ApiError } from '@/lib/api/errors'
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { getSystemDb, withSystem } from '@/lib/db/system'
import { systemClock } from '@/lib/domain/clock'
import { getServerEnv } from '@/lib/env'
import { refreshFlight } from '@/lib/services/flights/poll'
import { loadTransportEvent } from '@/lib/services/transport/context'
import { flightProviderFor } from '@/lib/services/worker/provider'
import { idParamsSchema } from '@/lib/validation/common'

export const POST = defineRoute({ roles: COORDINATOR_PLUS, params: idParamsSchema }, async ({ params, actor }) => {
  const env = getServerEnv()
  const db = getSystemDb()
  const event = await withSystem(db, { actor: 'system' }, (tx) => loadTransportEvent(tx))
  const provider = flightProviderFor(event, env.AERODATABOX_API_KEY)
  if (!provider) throw new ApiError(409, 'no_provider', 'Live flight data is not set up; set the landing time by hand instead')
  const result = await refreshFlight(db, params.id, { provider, now: systemClock.now(), dailyLimit: env.FLIGHT_POLL_DAILY_LIMIT, userId: actor.id })
  return jsonOk({ changed: result?.changed ?? false, proposal_ids: result?.proposal_ids ?? [] })
})
