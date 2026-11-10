// Switch the event this staff member works in (P9; the top-bar switcher). Only events they work
// on are accepted; the choice is remembered on their profile and applies to every later request.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { ANY_ROLE } from '@/lib/auth/roles'
import { setActiveEvent } from '@/lib/repositories/event'
import { activeEventSchema } from '@/lib/validation/event'

export const PUT = defineRoute({ roles: ANY_ROLE, body: activeEventSchema }, async ({ body, asActor }) => {
  await asActor((tx) => setActiveEvent(tx, body.event_id))
  // The screen reloads to show the new event (its pages read the choice from the profile).
  return jsonOk({ event_id: body.event_id })
})
