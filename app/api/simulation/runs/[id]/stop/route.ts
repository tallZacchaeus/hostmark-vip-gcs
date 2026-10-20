// Stops a running scenario. Steps already applied stay applied (they went through the live
// pipeline); their proposals can still be approved or rejected one by one.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { stopSimulationRun } from '@/lib/services/simulation/runner'
import { idParamsSchema } from '@/lib/validation/common'

export const POST = defineRoute({ roles: COORDINATOR_PLUS, params: idParamsSchema }, async ({ params, asActor }) => {
  return jsonOk(await asActor((tx) => stopSimulationRun(tx, params.id)))
})
