// Manual assignment or move (FR-RA-06). 409 `needs_confirmation` (with the violations and lost
// preferences) until every warning is acknowledged with a reason; the database re-checks the hard rules.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { systemClock } from '@/lib/domain/clock'
import { assignRoom } from '@/lib/services/rooms/assign'
import { assignRoomSchema } from '@/lib/validation/rooms'

export const POST = defineRoute({ roles: COORDINATOR_PLUS, body: assignRoomSchema }, async ({ body, asActor }) => {
  const request = { guestId: body.guest_id, roomId: body.room_id, reason: body.reason ?? null, acknowledged: body.acknowledged }
  const result = await asActor((tx) => assignRoom(tx, request, systemClock.now()))
  return jsonOk(result, { status: 201 })
})
