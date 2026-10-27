// Check a party out (id = delegation, FR-CL-01/02). The first confirmation wins: 409
// `already_checked_out` says who and when. Each emptied room goes to housekeeping.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { FRONT_DESK_ROLES } from '@/lib/auth/roles'
import { checkOutParty } from '@/lib/services/cleaning'
import { idParamsSchema } from '@/lib/validation/common'

export const POST = defineRoute({ roles: FRONT_DESK_ROLES, params: idParamsSchema }, async ({ params, asActor }) => {
  return jsonOk(await asActor((tx) => checkOutParty(tx, params.id)))
})
