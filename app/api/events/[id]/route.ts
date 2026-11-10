// Take a draft event live, or archive an event (P9 step 9.4). The database checks that the person
// manages the event, that the step is allowed (draft → live → archived) and that its owner has no
// other live event.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { EVENT_MANAGERS } from '@/lib/auth/roles'
import { setEventStatus } from '@/lib/repositories/events-admin'
import { idParamsSchema } from '@/lib/validation/common'
import { eventStatusSchema } from '@/lib/validation/event'

export const PATCH = defineRoute({ roles: EVENT_MANAGERS, params: idParamsSchema, body: eventStatusSchema }, async ({ params, body, asActor }) => {
  const status = await asActor((tx) => setEventStatus(tx, params.id, body.status))
  return jsonOk({ id: params.id, status })
})
