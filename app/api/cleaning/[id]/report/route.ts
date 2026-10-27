// Report a problem with a room (Figma "Report a problem"): kept on the task, sent to coordinators.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { HOUSEKEEPING_ROLES } from '@/lib/auth/roles'
import { reportProblem } from '@/lib/services/cleaning'
import { reportProblemSchema } from '@/lib/validation/cleaning'
import { idParamsSchema } from '@/lib/validation/common'

export const POST = defineRoute({ roles: HOUSEKEEPING_ROLES, params: idParamsSchema, body: reportProblemSchema }, async ({ params, body, asActor }) => {
  return jsonOk(await asActor((tx) => reportProblem(tx, params.id, body.kind, body.note ?? null)))
})
