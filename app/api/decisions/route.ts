// "Needs your decision" (FR-PL-09): open proposals, soonest-expiring first. Intake review items
// join this queue in P2.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { listPendingDecisions } from '@/lib/repositories/activity'
import { decisionsQuerySchema } from '@/lib/validation/activity'

export const GET = defineRoute({ roles: COORDINATOR_PLUS, query: decisionsQuerySchema }, async ({ query, asActor }) => {
  const { rows, total } = await asActor((tx) => listPendingDecisions(tx, query))
  return jsonOk(rows, { meta: { total, page: query.page, limit: query.limit } })
})
