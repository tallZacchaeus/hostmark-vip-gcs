// "Run allocator" (FR-RA-04): a plan for every guest without a room, stored as a proposal for
// review; nothing is assigned until the coordinator approves it. 409 `nothing_to_plan`.
import { createRateLimiter } from '@/lib/api/rate-limit'
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { getSystemDb, withSystem } from '@/lib/db/system'
import { systemClock } from '@/lib/domain/clock'
import { runAllocation } from '@/lib/services/rooms/plan'

/** Each run drafts a whole plan; a few a minute is plenty for a person. */
const RUNS_PER_MINUTE = 6

export const POST = defineRoute({ roles: COORDINATOR_PLUS, rateLimit: createRateLimiter({ windowMs: 60_000, max: RUNS_PER_MINUTE }) }, async ({ actor }) => {
  const plan = await withSystem(getSystemDb(), { actor: 'system', action: 'rooms.plan', onBehalfOf: actor.id, undoable: false }, (tx) =>
    runAllocation(tx, systemClock.now()),
  )
  return jsonOk(plan, { status: 201 })
})
