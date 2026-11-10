// Public registration link (FR-IN-01…03). No sign-in: GET says whether the link is open (and
// gives the bot-check site key); POST submits a registration. Both are limited per IP, and POST
// also by a per-IP-hash window in Postgres and Cloudflare Turnstile when configured.
import { getIntakeReader } from '@/lib/ai/intake-reader'
import { definePublicRoute } from '@/lib/api/public-route'
import { jsonOk } from '@/lib/api/response'
import { getSystemDb } from '@/lib/db/system'
import { getServerEnv } from '@/lib/env'
import { getMailer } from '@/lib/mail/get-mailer'
import { createTurnstileCheck } from '@/lib/security/turnstile'
import { readLinkContext, submitRegistration } from '@/lib/services/intake/public-submit'
import { intakeTokenParamsSchema, publicRegistrationSchema } from '@/lib/validation/intake'

export const GET = definePublicRoute({ params: intakeTokenParamsSchema }, async ({ params }) => {
  const context = await readLinkContext(getSystemDb(), params.token)
  return jsonOk({ ...context, turnstile_site_key: getServerEnv().TURNSTILE_SITE_KEY ?? null })
})

export const POST = definePublicRoute({ params: intakeTokenParamsSchema, body: publicRegistrationSchema }, async ({ params, body, ip }) => {
  const env = getServerEnv()
  const receipt = await submitRegistration(
    {
      db: getSystemDb(),
      reader: await getIntakeReader(),
      botCheck: createTurnstileCheck(env.TURNSTILE_SECRET_KEY, fetch, new URL(env.BETTER_AUTH_URL).hostname),
      ipHashSecret: env.BETTER_AUTH_SECRET,
      mailer: getMailer(),
    },
    params.token,
    body,
    ip,
  )
  return jsonOk(receipt, { status: 201 })
})
