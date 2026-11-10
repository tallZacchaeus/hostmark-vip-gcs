// The current event's settings (FR-PL-03). GET: coordinators and above. PATCH: Admin and above.
// New events are created on the Events page (POST /api/events, P9 step 9.4).
import { Errors } from '@/lib/api/errors'
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { ADMIN_PLUS, COORDINATOR_PLUS } from '@/lib/auth/roles'
import { findEvent, updateEvent } from '@/lib/repositories/event'
import { eventUpdateSchema } from '@/lib/validation/event'

export const GET = defineRoute({ roles: COORDINATOR_PLUS }, async ({ asActor }) => {
  const event = await asActor((tx) => findEvent(tx))
  if (!event) {
    throw Errors.notFound('Event')
  }
  return jsonOk(event)
})

export const PATCH = defineRoute({ roles: ADMIN_PLUS, body: eventUpdateSchema }, async ({ body, asActor }) => {
  const event = await asActor((tx) => updateEvent(tx, body))
  if (!event) {
    throw Errors.notFound('Event')
  }
  return jsonOk(event)
})
