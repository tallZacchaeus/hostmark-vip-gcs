import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import type { MailMessage, Mailer } from '@/lib/mail/mailer'
import type { DemoRequestInput } from '@/lib/validation/demo-request'
import { requestDemo } from './demo-request'

const INPUT: DemoRequestInput = {
  name: 'Ada Nwosu',
  organisation: 'Lagos Leadership Forum',
  email: 'ada@example.com',
  event_size: '50_200',
  message: 'Two venues, about 120 VIP guests.',
  website: '',
}
const RECIPIENT = 'sales@example.com'

function recordingMailer(options: { enabled?: boolean; ok?: boolean } = {}): Mailer & { readonly sent: MailMessage[] } {
  const { enabled = true, ok = true } = options
  const sent: MailMessage[] = []
  return {
    enabled,
    sent,
    async send(message) {
      sent.push(message)
      return ok ? { ok: true, id: 'email-1' } : { ok: false, reason: 'rejected_500' }
    },
  }
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.catch((caught: unknown) => caught)
  if (!(error instanceof ApiError)) throw new Error('Expected an ApiError')
  return error
}

describe('requestDemo', () => {
  it('emails the request to the configured address, with replies going to the person who asked', async () => {
    // Arrange
    const mailer = recordingMailer()

    // Act
    const outcome = await requestDemo({ mailer, recipient: RECIPIENT }, INPUT)

    // Assert
    expect(outcome).toEqual({ received: true })
    expect(mailer.sent).toHaveLength(1)
    expect(mailer.sent[0]).toMatchObject({ to: RECIPIENT, replyTo: 'ada@example.com', subject: 'Demo request from Lagos Leadership Forum' })
    expect(mailer.sent[0]?.text).toContain('Two venues, about 120 VIP guests.')
    expect(mailer.sent[0]?.text).toContain('50 to 200')
  })

  it('pretends to accept a request whose hidden website field was filled in (a bot) and sends nothing', async () => {
    // Arrange
    const mailer = recordingMailer()

    // Act
    const outcome = await requestDemo({ mailer, recipient: RECIPIENT }, { ...INPUT, website: 'https://spam.example' })

    // Assert
    expect(outcome).toEqual({ received: true })
    expect(mailer.sent).toHaveLength(0)
  })

  it('says demo requests are not open when no recipient or no mail service is set up', async () => {
    // Act
    const noRecipient = await failure(requestDemo({ mailer: recordingMailer(), recipient: undefined }, INPUT))
    const noMail = await failure(requestDemo({ mailer: recordingMailer({ enabled: false }), recipient: RECIPIENT }, INPUT))

    // Assert
    expect(noRecipient).toMatchObject({ status: 503, code: 'demo_requests_unavailable' })
    expect(noMail).toMatchObject({ status: 503, code: 'demo_requests_unavailable' })
  })

  it('asks the person to try again when the email could not be sent', async () => {
    // Act
    const error = await failure(requestDemo({ mailer: recordingMailer({ ok: false }), recipient: RECIPIENT }, INPUT))

    // Assert
    expect(error).toMatchObject({ status: 502, code: 'demo_request_not_sent' })
    expect(error.message).toMatch(/try again/i)
  })
})
