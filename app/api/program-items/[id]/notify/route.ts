// Figma "Notify programme team" on an at-risk item. 409 `not_at_risk` once the conflict is gone.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { PROGRAM_READERS } from '@/lib/auth/roles'
import { notifyProgrammeTeam } from '@/lib/services/programme'
import { idParamsSchema } from '@/lib/validation/common'

export const POST = defineRoute({ roles: PROGRAM_READERS, params: idParamsSchema }, async ({ params, asActor }) => {
  return jsonOk(await asActor((tx) => notifyProgrammeTeam(tx, params.id)))
})
