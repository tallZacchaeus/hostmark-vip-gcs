// Staff accounts (FR-PL-01). Admin manages staff below Admin; Super Admin manages everyone.
// POST emails the new member a set-password link when email is on; otherwise (or if the email
// fails) it returns the temporary password once. It is never stored or shown again.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { ADMIN_PLUS } from '@/lib/auth/roles'
import { createAccount, listAccounts } from '@/lib/services/accounts'
import { accountCreateSchema, accountListQuerySchema } from '@/lib/validation/accounts'

export const GET = defineRoute({ roles: ADMIN_PLUS, query: accountListQuerySchema }, async ({ actor, query, db }) => {
  const { rows, total } = await listAccounts(db, actor, query)
  return jsonOk(rows, { meta: { total, page: query.page, limit: query.limit } })
})

export const POST = defineRoute({ roles: ADMIN_PLUS, body: accountCreateSchema }, async ({ actor, body, db, request }) => {
  const { account, temporaryPassword, delivery } = await createAccount(db, actor, body, request.headers)
  return jsonOk({ account, temporary_password: temporaryPassword, password_delivery: delivery }, { status: 201 })
})
