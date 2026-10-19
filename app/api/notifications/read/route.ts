// Mark notifications as read: { "ids": [...] }, or {} for all unread.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { ANY_ROLE } from '@/lib/auth/roles'
import { markNotificationsRead } from '@/lib/repositories/activity'
import { markReadBodySchema } from '@/lib/validation/activity'

export const POST = defineRoute({ roles: ANY_ROLE, body: markReadBodySchema }, async ({ actor, body, asActor }) => {
  const updated = await asActor((tx) => markNotificationsRead(tx, actor.id, body.ids))
  return jsonOk({ updated })
})
