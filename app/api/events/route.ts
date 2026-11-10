// The Events page (P9 step 9.4). GET: the events this person manages (a Super Admin: all).
// POST: a new draft event, owned by its creator. Programme Managers and Super Admins only.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { EVENT_MANAGERS } from '@/lib/auth/roles'
import { createEvent, listManageableEvents } from '@/lib/repositories/events-admin'
import { eventCreateSchema } from '@/lib/validation/event'

export const GET = defineRoute({ roles: EVENT_MANAGERS }, async ({ asActor }) => jsonOk(await asActor((tx) => listManageableEvents(tx))))

export const POST = defineRoute({ roles: EVENT_MANAGERS, body: eventCreateSchema }, async ({ body, asActor }) => {
  const event = await asActor((tx) => createEvent(tx, body))
  return jsonOk(event, { status: 201 })
})
