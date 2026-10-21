// One room plan with its lines (Figma "Allocation plan"). Decide it with
// POST /api/proposals/[id]/approve `{ line_ids? }` or /reject.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { loadRoomPlan } from '@/lib/repositories/room-plan'
import { idParamsSchema } from '@/lib/validation/common'

export const GET = defineRoute({ roles: COORDINATOR_PLUS, params: idParamsSchema }, async ({ params, asActor }) => {
  return jsonOk(await asActor((tx) => loadRoomPlan(tx, params.id)))
})
