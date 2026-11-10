// Report a problem with a room (Figma "Report a problem"): kept on the task, sent to coordinators.
// Each report alerts every coordinator, so a person may send a few a minute, not a flood.
import { createRateLimiter } from '@/lib/api/rate-limit'
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { HOUSEKEEPING_ROLES } from '@/lib/auth/roles'
import { reportProblem } from '@/lib/services/cleaning'
import { reportProblemSchema } from '@/lib/validation/cleaning'
import { idParamsSchema } from '@/lib/validation/common'

const REPORTS_PER_MINUTE = 5

export const POST = defineRoute({
  roles: HOUSEKEEPING_ROLES,
  params: idParamsSchema,
  body: reportProblemSchema,
  rateLimit: createRateLimiter({ windowMs: 60_000, max: REPORTS_PER_MINUTE }),
}, async ({ params, body, asActor }) => {
  return jsonOk(await asActor((tx) => reportProblem(tx, params.id, body.kind, body.note ?? null)))
})
