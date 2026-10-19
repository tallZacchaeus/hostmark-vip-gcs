// Change the signed-in user's password (also clears a temporary password). Other sessions are
// signed out; the new session token is returned for bearer-token clients.
import { createRateLimiter } from '@/lib/api/rate-limit'
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { ANY_ROLE } from '@/lib/auth/roles'
import { changeOwnPassword } from '@/lib/services/accounts'
import { passwordChangeSchema } from '@/lib/validation/accounts'

// Each attempt checks the current password, so a stolen session must not be able to guess it quickly.
const PASSWORD_ATTEMPTS_PER_MINUTE = 5

export const POST = defineRoute(
  {
    roles: ANY_ROLE,
    body: passwordChangeSchema,
    allowPendingPasswordChange: true,
    rateLimit: createRateLimiter({ windowMs: 60_000, max: PASSWORD_ATTEMPTS_PER_MINUTE }),
  },
  async ({ actor, body, db, request }) => {
    const { token, responseHeaders } = await changeOwnPassword(
      db,
      actor,
      { current: body.current_password, next: body.new_password },
      request.headers,
    )
    const headers = new Headers()
    for (const cookie of responseHeaders.getSetCookie()) {
      headers.append('Set-Cookie', cookie)
    }
    const bearer = responseHeaders.get('set-auth-token')
    if (bearer) {
      headers.set('set-auth-token', bearer)
    }
    return jsonOk({ password_changed: true, token }, { headers })
  },
)
