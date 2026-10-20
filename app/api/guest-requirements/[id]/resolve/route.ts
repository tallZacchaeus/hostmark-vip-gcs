// Mark an extracted issue as dealt with ("Dismiss" on the guest profile). Logged and undoable.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { resolveRequirement } from '@/lib/services/guests'
import { idParamsSchema } from '@/lib/validation/common'

export const POST = defineRoute({ roles: COORDINATOR_PLUS, params: idParamsSchema }, async ({ actor, params, asActor }) =>
  jsonOk(await asActor((tx) => resolveRequirement(tx, params.id, actor.id))),
)
