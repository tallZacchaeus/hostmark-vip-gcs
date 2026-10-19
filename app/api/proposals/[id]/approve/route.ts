// One-tap approval. The database re-validates the proposal against current data before acting.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { decideProposal } from '@/lib/repositories/activity'
import { approveBodySchema } from '@/lib/validation/activity'
import { idParamsSchema } from '@/lib/validation/common'

export const POST = defineRoute(
  { roles: COORDINATOR_PLUS, params: idParamsSchema, body: approveBodySchema },
  async ({ params, body, asActor }) => {
    const result = await asActor((tx) => decideProposal(tx, params.id, { approve: true, lineIds: body.line_ids }))
    return jsonOk(result)
  },
)
