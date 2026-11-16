// "Request a demo" from the public landing page. No sign-in. Limited to a few requests per IP
// (stricter than other public routes: each one sends an email), with a honeypot field for bots.
// Nothing is stored; the request is emailed to DEMO_REQUEST_TO.
import { definePublicRoute } from '@/lib/api/public-route'
import { createRateLimiter } from '@/lib/api/rate-limit'
import { jsonOk } from '@/lib/api/response'
import { getServerEnv } from '@/lib/env'
import { getMailer } from '@/lib/mail/get-mailer'
import { requestDemo } from '@/lib/services/demo-request'
import { demoRequestSchema } from '@/lib/validation/demo-request'

const DEMO_REQUEST_LIMIT = { windowMs: 10 * 60_000, max: 5 }

export const POST = definePublicRoute(
  { body: demoRequestSchema, rateLimit: createRateLimiter(DEMO_REQUEST_LIMIT) },
  async ({ body }) => {
    const outcome = await requestDemo({ mailer: getMailer(), recipient: getServerEnv().DEMO_REQUEST_TO }, body)
    return jsonOk(outcome, { status: 201 })
  },
)
