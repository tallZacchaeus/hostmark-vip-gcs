// Issues a new temporary password, signs the account out everywhere and forces a change at
// next sign-in. With email on, the owner gets a link to choose a new one; otherwise the password
// is returned once.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { ADMIN_PLUS } from '@/lib/auth/roles'
import { resetAccountPassword } from '@/lib/services/accounts'
import { idParamsSchema } from '@/lib/validation/common'

export const POST = defineRoute({ roles: ADMIN_PLUS, params: idParamsSchema }, async ({ actor, params, db, request }) => {
  const { temporaryPassword, delivery } = await resetAccountPassword(db, actor, params.id, request.headers)
  return jsonOk({ temporary_password: temporaryPassword, password_delivery: delivery })
})
