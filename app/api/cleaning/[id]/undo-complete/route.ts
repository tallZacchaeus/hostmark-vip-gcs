// "Undo" right after a mistaken Mark ready (within ten minutes; by whoever did it or a coordinator).
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { HOUSEKEEPING_ROLES } from '@/lib/auth/roles'
import { runTaskAction } from '@/lib/services/cleaning'
import { idParamsSchema } from '@/lib/validation/common'

export const POST = defineRoute({ roles: HOUSEKEEPING_ROLES, params: idParamsSchema }, async ({ params, asActor }) => {
  return jsonOk(await asActor((tx) => runTaskAction(tx, 'undoComplete', params.id)))
})
