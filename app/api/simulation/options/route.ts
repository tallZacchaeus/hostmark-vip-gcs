// What the simulation screen offers: the scripted scenarios, the flights, drivers and rooms a
// what-if can use, and whether the event is in simulated mode (scripted runs need it; what-ifs do not).
import { ApiError } from '@/lib/api/errors'
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { SCENARIOS } from '@/lib/domain/simulation/scenarios'
import { findEventContext } from '@/lib/repositories/event'
import { listDriverOptions, listFlightOptions, listRoomOptions } from '@/lib/repositories/simulation'

export const GET = defineRoute({ roles: COORDINATOR_PLUS }, async ({ asActor }) => {
  const result = await asActor(async (tx) => {
    const event = await findEventContext(tx)
    if (!event) throw new ApiError(409, 'event_not_found', 'Set up the event first')
    return { flight_mode: event.flight_mode, timezone: event.timezone, flights: await listFlightOptions(tx), drivers: await listDriverOptions(tx), rooms: await listRoomOptions(tx) }
  })
  const scenarios = SCENARIOS.map(({ key, title, description, steps }) => ({ key, title, description, steps: steps.length }))
  return jsonOk({ ...result, scenarios })
})
