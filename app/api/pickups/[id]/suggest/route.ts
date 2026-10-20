// "Suggest a driver" (FR-FT-06): the matcher picks the best free driver for one pickup and the
// suggestion goes to the approvals list like any other proposal (P1: nothing is assigned yet).
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { getSystemDb, withSystem } from '@/lib/db/system'
import { suggestDriver } from '@/lib/services/transport/suggest'
import { idParamsSchema } from '@/lib/validation/common'

export const POST = defineRoute({ roles: COORDINATOR_PLUS, params: idParamsSchema }, async ({ params, actor }) => {
  const suggestion = await withSystem(getSystemDb(), { actor: 'system', action: 'transport.suggest', onBehalfOf: actor.id, undoable: false }, (tx) =>
    suggestDriver(tx, params.id),
  )
  return jsonOk(suggestion)
})
