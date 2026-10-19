// The signed-in user's notifications, newest first, with the unread count.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { ANY_ROLE } from '@/lib/auth/roles'
import { listNotifications } from '@/lib/repositories/activity'
import { notificationListQuerySchema } from '@/lib/validation/activity'

export const GET = defineRoute({ roles: ANY_ROLE, query: notificationListQuerySchema }, async ({ actor, query, asActor }) => {
  const { rows, total, unread } = await asActor((tx) =>
    listNotifications(tx, actor.id, query.unread_only ?? false, { page: query.page, limit: query.limit }),
  )
  return jsonOk({ items: rows, unread_count: unread }, { meta: { total, page: query.page, limit: query.limit } })
})
