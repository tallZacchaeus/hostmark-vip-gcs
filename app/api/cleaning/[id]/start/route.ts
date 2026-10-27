// Start cleaning (FR-CL-05). 409 `already_started` says who started it and when.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { HOUSEKEEPING_ROLES } from '@/lib/auth/roles'
import { runTaskAction } from '@/lib/services/cleaning'
import { idParamsSchema } from '@/lib/validation/common'

export const POST = defineRoute({ roles: HOUSEKEEPING_ROLES, params: idParamsSchema }, async ({ params, asActor }) => {
  return jsonOk(await asActor((tx) => runTaskAction(tx, 'start', params.id)))
})
