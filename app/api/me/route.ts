// The signed-in staff member, where their app should open, and the event context.
// Allowed while a temporary password is pending so the client can show the change screen.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { ANY_ROLE, HOME_ROUTES } from '@/lib/auth/roles'
import { findEventContext } from '@/lib/repositories/event'

export const GET = defineRoute({ roles: ANY_ROLE, allowPendingPasswordChange: true }, async ({ actor, asActor }) => {
  const event = await asActor((tx) => findEventContext(tx))
  return jsonOk({
    user: {
      id: actor.id,
      email: actor.email,
      full_name: actor.fullName,
      role: actor.role,
      must_change_password: actor.mustChangePassword,
    },
    home_route: HOME_ROUTES[actor.role],
    event,
  })
})
