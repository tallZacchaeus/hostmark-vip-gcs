// Dry run of a manual move (FR-RA-06): the hard rules it breaks and the preferences it loses, for
// the warning dialog. Writes nothing.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { systemClock } from '@/lib/domain/clock'
import { checkMove } from '@/lib/services/rooms/check'
import { moveCheckSchema } from '@/lib/validation/rooms'

export const POST = defineRoute({ roles: COORDINATOR_PLUS, body: moveCheckSchema }, async ({ body, asActor }) => {
  return jsonOk(await asActor((tx) => checkMove(tx, body.guest_id, body.room_id, systemClock.now())))
})
