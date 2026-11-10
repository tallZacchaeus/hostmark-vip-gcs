// One room (FR-PL-04): read, edit and delete as the generic venue routes do. Saving a room as out
// of service also re-plans the stays in it, exactly as the simulation's room scenario does: a
// planned stay gets a move proposal, a checked-in guest an alert. That runs as vip_system on the
// admin's behalf, after their edit is saved (rooms/out-of-service.ts).
import { Errors } from '@/lib/api/errors'
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { ADMIN_PLUS } from '@/lib/auth/roles'
import { roomRepository, roomRoutes } from '@/lib/resources/venue'
import { reworkRoomsTakenOutOfService } from '@/lib/services/rooms/out-of-service'
import { idParamsSchema } from '@/lib/validation/common'
import { roomUpdateSchema } from '@/lib/validation/venue'

export const GET = roomRoutes.get
export const DELETE = roomRoutes.remove

export const PATCH = defineRoute({ roles: ADMIN_PLUS, params: idParamsSchema, body: roomUpdateSchema }, async ({ params, body, actor, asActor }) => {
  const { before, after } = await asActor(async (tx) => {
    // Locked before reading, so of two saves at once only one sees the room go out of service.
    const current = await tx.selectFrom('rooms').select('out_of_service').where('id', '=', params.id).forUpdate().executeTakeFirst()
    return { before: current, after: await roomRepository.update(tx, params.id, body) }
  })
  if (!after) throw Errors.notFound('Room')
  if (after.out_of_service && before?.out_of_service === false) await reworkRoomsTakenOutOfService([params.id], actor.id)
  return jsonOk(after)
})
