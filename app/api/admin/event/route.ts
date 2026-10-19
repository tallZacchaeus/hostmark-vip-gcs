// Event settings (FR-PL-03). GET: coordinators and above. POST (first-time setup) and PATCH: Admin.
import { Errors } from '@/lib/api/errors'
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { ADMIN_PLUS, COORDINATOR_PLUS } from '@/lib/auth/roles'
import { findEvent, insertEvent, updateEvent } from '@/lib/repositories/event'
import { eventCreateSchema, eventUpdateSchema } from '@/lib/validation/event'

export const GET = defineRoute({ roles: COORDINATOR_PLUS }, async ({ asActor }) => {
  const event = await asActor((tx) => findEvent(tx))
  if (!event) {
    throw Errors.notFound('Event')
  }
  return jsonOk(event)
})

export const POST = defineRoute({ roles: ADMIN_PLUS, body: eventCreateSchema }, async ({ body, asActor }) => {
  const event = await asActor((tx) => insertEvent(tx, body))
  return jsonOk(event, { status: 201 })
})

export const PATCH = defineRoute({ roles: ADMIN_PLUS, body: eventUpdateSchema }, async ({ body, asActor }) => {
  const event = await asActor((tx) => updateEvent(tx, body))
  if (!event) {
    throw Errors.notFound('Event')
  }
  return jsonOk(event)
})
