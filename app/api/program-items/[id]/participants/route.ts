// Replace an item's VIP participants (FR-PG-02); the at-risk flag is recomputed.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { PROGRAM_EDITORS } from '@/lib/auth/roles'
import { setParticipants } from '@/lib/services/programme'
import { idParamsSchema } from '@/lib/validation/common'
import { participantsSchema } from '@/lib/validation/programme'

export const PUT = defineRoute({ roles: PROGRAM_EDITORS, params: idParamsSchema, body: participantsSchema }, async ({ params, body, asActor }) => {
  return jsonOk(await asActor((tx) => setParticipants(tx, params.id, body)))
})
