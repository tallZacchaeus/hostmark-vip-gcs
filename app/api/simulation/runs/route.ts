// Scripted simulation runs (FR-PL-10): GET the recent runs, POST start one (simulated mode only,
// one at a time). The worker applies the steps; this route only records the run.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { listSimulationRuns } from '@/lib/repositories/simulation'
import { startSimulationRun } from '@/lib/services/simulation/runner'
import { simulationStartSchema } from '@/lib/validation/transport'

export const GET = defineRoute({ roles: COORDINATOR_PLUS }, async ({ asActor }) => {
  return jsonOk({ runs: await asActor((tx) => listSimulationRuns(tx)) })
})

export const POST = defineRoute({ roles: COORDINATOR_PLUS, body: simulationStartSchema }, async ({ body, actor, asActor }) => {
  const run = await asActor((tx) => startSimulationRun(tx, body, actor.id))
  return jsonOk(run, { status: 201 })
})
