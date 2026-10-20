// "Read message" in the Paste drawer (FR-IN-05): returns what was read from a forwarded message
// without saving anything. Limited per user because each call may use the AI.
import { getIntakeReader } from '@/lib/ai/intake-reader'
import { createRateLimiter } from '@/lib/api/rate-limit'
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { readPastedMessage } from '@/lib/services/intake/review'
import { pastedMessageSchema } from '@/lib/validation/intake'

const AI_CALLS_PER_MINUTE = { windowMs: 60_000, max: 10 }

export const POST = defineRoute(
  { roles: COORDINATOR_PLUS, body: pastedMessageSchema, rateLimit: createRateLimiter(AI_CALLS_PER_MINUTE) },
  async ({ db, actor, body }) => jsonOk(await readPastedMessage(db, actor, body.text, await getIntakeReader())),
)
