// Reverse a mistaken check-out (FR-CL-06; id = the room's cleaning task). Coordinators only;
// 409 `cleaning_started` once housekeeping has begun.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { runTaskAction } from '@/lib/services/cleaning'
import { idParamsSchema } from '@/lib/validation/common'

export const POST = defineRoute({ roles: COORDINATOR_PLUS, params: idParamsSchema }, async ({ params, asActor }) => {
  return jsonOk(await asActor((tx) => runTaskAction(tx, 'reverseCheckout', params.id)))
})
