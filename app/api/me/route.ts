// The signed-in staff member, where their app should open, the current event's context and the
// events they work on.
// Allowed while a temporary password is pending so the client can show the change screen.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { ANY_ROLE, HOME_ROUTES } from '@/lib/auth/roles'
import { findEventContext, listMyEvents } from '@/lib/repositories/event'

export const GET = defineRoute({ roles: ANY_ROLE, allowPendingPasswordChange: true }, async ({ actor, asActor }) => {
  const { event, events } = await asActor(async (tx) => ({ event: await findEventContext(tx), events: await listMyEvents(tx) }))
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
    // Every event this person works on (P9), for the event switcher; one has is_current.
    events,
  })
})
