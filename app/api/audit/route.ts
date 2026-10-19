// Activity log (FR-PL-07): newest first, filterable by entity, actor, time and automatic actions.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { listAuditEntries } from '@/lib/repositories/activity'
import { auditListQuerySchema } from '@/lib/validation/activity'

export const GET = defineRoute({ roles: COORDINATOR_PLUS, query: auditListQuerySchema }, async ({ query, asActor }) => {
  const { page, limit, ...filters } = query
  const { rows, total } = await asActor((tx) => listAuditEntries(tx, filters, { page, limit }))
  return jsonOk(rows, { meta: { total, page, limit } })
})
