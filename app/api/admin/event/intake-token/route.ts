// Regenerates the shared intake link token; the old link stops working immediately.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { ADMIN_PLUS } from '@/lib/auth/roles'
import { regenerateIntakeToken } from '@/lib/repositories/event'

export const POST = defineRoute({ roles: ADMIN_PLUS }, async ({ asActor }) => {
  const intakeToken = await asActor((tx) => regenerateIntakeToken(tx))
  return jsonOk({ intake_token: intakeToken })
})
