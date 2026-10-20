// Intake queue (FR-IN-10): GET lists submissions by review reason with a count per tab; POST
// saves a pasted message as a draft for review (FR-IN-05).
import { getIntakeReader } from '@/lib/ai/intake-reader'
import { createRateLimiter } from '@/lib/api/rate-limit'
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { countSubmissionTabs, listSubmissions, readIntakeLink } from '@/lib/repositories/intake'
import { createPastedDraft } from '@/lib/services/intake/review'
import { pastedMessageSchema, submissionListQuerySchema } from '@/lib/validation/intake'

const AI_CALLS_PER_MINUTE = { windowMs: 60_000, max: 10 }

export const GET = defineRoute({ roles: COORDINATOR_PLUS, query: submissionListQuerySchema }, async ({ query, asActor }) => {
  const { page, limit, ...filters } = query
  const result = await asActor(async (tx) => ({
    ...(await listSubmissions(tx, filters, { page, limit })),
    tabs: await countSubmissionTabs(tx),
    link: await readIntakeLink(tx),
  }))
  return jsonOk({ rows: result.rows, tabs: result.tabs, link: result.link }, { meta: { total: result.total, page, limit } })
})

export const POST = defineRoute(
  { roles: COORDINATOR_PLUS, body: pastedMessageSchema, rateLimit: createRateLimiter(AI_CALLS_PER_MINUTE) },
  async ({ db, actor, body }) => jsonOk(await createPastedDraft(db, actor, body.text, await getIntakeReader()), { status: 201 }),
)
