// Add someone to a delegation (FR-IN-11), named or as a placeholder; "Add as guest" on an
// extracted issue also resolves that issue. The live pickup's passenger count follows.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { addMember } from '@/lib/services/guests'
import { idParamsSchema } from '@/lib/validation/common'
import { memberCreateSchema } from '@/lib/validation/guests'

export const POST = defineRoute({ roles: COORDINATOR_PLUS, params: idParamsSchema, body: memberCreateSchema }, async ({ actor, params, body, asActor }) =>
  jsonOk(await asActor((tx) => addMember(tx, params.id, body, actor.id)), { status: 201 }),
)
