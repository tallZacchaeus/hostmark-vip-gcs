// An event's team (P9 step 9.4). GET: every staff account below Programme Manager, with whether it
// works on this event. PUT: put one on the team or take them off (not while archived).
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { EVENT_MANAGERS } from '@/lib/auth/roles'
import { listEventStaff, setEventMember } from '@/lib/repositories/events-admin'
import { idParamsSchema } from '@/lib/validation/common'
import { eventMemberSchema } from '@/lib/validation/event'

export const GET = defineRoute({ roles: EVENT_MANAGERS, params: idParamsSchema }, async ({ params, asActor }) =>
  jsonOk(await asActor((tx) => listEventStaff(tx, params.id))),
)

export const PUT = defineRoute({ roles: EVENT_MANAGERS, params: idParamsSchema, body: eventMemberSchema }, async ({ params, body, asActor }) => {
  await asActor((tx) => setEventMember(tx, params.id, body.profile_id, body.member))
  return jsonOk({ profile_id: body.profile_id, member: body.member })
})
