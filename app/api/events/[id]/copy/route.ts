// Copy the setup of an earlier event into this draft (P9 step 9.4): settings, rooms, VIP
// categories, drivers and staff, as chosen. Refused once the draft has that setup already.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { EVENT_MANAGERS } from '@/lib/auth/roles'
import { copyEventSetup } from '@/lib/repositories/events-admin'
import { idParamsSchema } from '@/lib/validation/common'
import { copySetupSchema } from '@/lib/validation/event'

export const POST = defineRoute({ roles: EVENT_MANAGERS, params: idParamsSchema, body: copySetupSchema }, async ({ params, body, asActor }) =>
  jsonOk(await asActor((tx) => copyEventSetup(tx, params.id, body.from_event_id, body.parts))),
)
