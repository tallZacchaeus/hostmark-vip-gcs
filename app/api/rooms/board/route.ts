// Room grid (03-App-Flow.md /rooms): every room with status, stays and suggestions, the summary
// counts, the pending plan and how many guests still need a room.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { loadRoomsBoard } from '@/lib/repositories/rooms-board'

export const GET = defineRoute({ roles: COORDINATOR_PLUS }, async ({ asActor }) => {
  return jsonOk(await asActor((tx) => loadRoomsBoard(tx)))
})
