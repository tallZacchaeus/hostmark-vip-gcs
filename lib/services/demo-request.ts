// "Request a demo" (landing page): emails the request to the Hostmark team (DEMO_REQUEST_TO),
// with replies going to the person who asked. Nothing is stored. A filled-in honeypot is treated
// as a bot: it gets the same answer as a person, so it learns nothing, and no email is sent.
import { ApiError } from '@/lib/api/errors'
import { logger } from '@/lib/logger'
import type { Mailer } from '@/lib/mail/mailer'
import { demoRequestEmail } from '@/lib/mail/templates'
import { type DemoRequestInput, EVENT_SIZE_LABELS } from '@/lib/validation/demo-request'

export interface DemoRequestDeps {
  readonly mailer: Mailer
  /** Where requests go; unset means demo requests are not open. */
  readonly recipient: string | undefined
}

export interface DemoRequestOutcome {
  readonly received: true
}

const RECEIVED: DemoRequestOutcome = { received: true }

export async function requestDemo(deps: DemoRequestDeps, input: DemoRequestInput): Promise<DemoRequestOutcome> {
  if (input.website) return RECEIVED
  if (!deps.recipient || !deps.mailer.enabled) {
    throw new ApiError(503, 'demo_requests_unavailable', 'Demo requests are not open yet. Please try again later.')
  }
  const content = demoRequestEmail({
    name: input.name,
    organisation: input.organisation,
    email: input.email,
    eventSizeLabel: input.event_size ? EVENT_SIZE_LABELS[input.event_size] : undefined,
    message: input.message,
  })
  const result = await deps.mailer.send({ ...content, to: deps.recipient, replyTo: input.email })
  if (!result.ok) {
    // The reason only (never the person's details): enough to see that Resend refused or was down.
    logger.warn('Demo request email not sent', { reason: result.reason })
    throw new ApiError(502, 'demo_request_not_sent', 'We could not send your request. Please try again in a few minutes.')
  }
  return RECEIVED
}
