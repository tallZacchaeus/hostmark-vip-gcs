// Dashboard counters for the coordinator console.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { systemClock } from '@/lib/domain/clock'
import { readDashboardSummary } from '@/lib/repositories/dashboard'

export const GET = defineRoute({ roles: COORDINATOR_PLUS }, async ({ asActor }) => {
  return jsonOk(await asActor((tx) => readDashboardSummary(tx, systemClock.now())))
})
