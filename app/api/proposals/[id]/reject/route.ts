// Reject a proposal (and any pending lines of a room plan), with an optional note.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { decideProposal } from '@/lib/repositories/activity'
import { rejectBodySchema } from '@/lib/validation/activity'
import { idParamsSchema } from '@/lib/validation/common'

export const POST = defineRoute(
  { roles: COORDINATOR_PLUS, params: idParamsSchema, body: rejectBodySchema },
  async ({ params, body, asActor }) => {
    const result = await asActor((tx) => decideProposal(tx, params.id, { approve: false, note: body.note ?? null }))
    return jsonOk(result)
  },
)
