// Undo an automatic action (F10). Refused with 409 "undo_conflict" if the record changed since.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { undoAuditEntry } from '@/lib/repositories/activity'
import { auditIdParamsSchema, undoBodySchema } from '@/lib/validation/activity'

export const POST = defineRoute(
  { roles: COORDINATOR_PLUS, params: auditIdParamsSchema, body: undoBodySchema },
  async ({ params, body, asActor }) => {
    const result = await asActor((tx) => undoAuditEntry(tx, params.id, body.reason ?? null))
    return jsonOk(result)
  },
)
