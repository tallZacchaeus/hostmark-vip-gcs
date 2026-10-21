// Front desk (FR-RA-09): parties arriving on `?day=` (default today, or the next day with
// arrivals), in house, and leaving that day.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { FRONT_DESK_ROLES } from '@/lib/auth/roles'
import { systemClock } from '@/lib/domain/clock'
import { loadFrontDesk } from '@/lib/repositories/front-desk'
import { dayQuerySchema } from '@/lib/validation/transport'

export const GET = defineRoute({ roles: FRONT_DESK_ROLES, query: dayQuerySchema }, async ({ query, asActor }) => {
  return jsonOk(await asActor((tx) => loadFrontDesk(tx, query.day, systemClock.now())))
})
