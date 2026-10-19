// One staff account: read, rename, change role or phone, deactivate or reactivate.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { ADMIN_PLUS } from '@/lib/auth/roles'
import { getAccount, updateAccount } from '@/lib/services/accounts'
import { accountUpdateSchema } from '@/lib/validation/accounts'
import { idParamsSchema } from '@/lib/validation/common'

export const GET = defineRoute({ roles: ADMIN_PLUS, params: idParamsSchema }, async ({ actor, params, db }) => {
  return jsonOk(await getAccount(db, actor, params.id))
})

export const PATCH = defineRoute(
  { roles: ADMIN_PLUS, params: idParamsSchema, body: accountUpdateSchema },
  async ({ actor, params, body, db, request }) => {
    return jsonOk(await updateAccount(db, actor, params.id, body, request.headers))
  },
)
