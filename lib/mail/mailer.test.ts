import { describe, expect, it, vi } from 'vitest'
import { createResendMailer } from './mailer'

const MESSAGE = { to: 'ada@example.com', subject: 'Hello', text: 'Plain', html: '<p>Rich</p>' } as const
const reply = (body: unknown, ok = true, status = 200) => vi.fn(async () => ({ ok, status, json: async () => body }))

describe('createResendMailer', () => {
  it('is off without an API key and sends nothing', async () => {
    // Arrange
    const fetchFn = reply({ id: 'x' })
    const mailer = createResendMailer({ apiKey: undefined, from: 'Hostmark <noreply@hostmark.tech>' }, fetchFn)

    // Act
    const result = await mailer.send(MESSAGE)

    // Assert
    expect(mailer.enabled).toBe(false)
    expect(result).toEqual({ ok: false, reason: 'not_configured' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('posts the message to Resend with the key, sender and both bodies', async () => {
    // Arrange
    const fetchFn = reply({ id: 'email-1' })
    const mailer = createResendMailer({ apiKey: 're_test', from: 'Hostmark <noreply@hostmark.tech>' }, fetchFn)

    // Act
    const result = await mailer.send(MESSAGE)

    // Assert
    expect(mailer.enabled).toBe(true)
    expect(result).toEqual({ ok: true, id: 'email-1' })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test')
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Hostmark <noreply@hostmark.tech>',
      to: ['ada@example.com'],
      subject: 'Hello',
      text: 'Plain',
      html: '<p>Rich</p>',
    })
  })

  it('sends a reply-to address when one is given', async () => {
    // Arrange
    const fetchFn = reply({ id: 'email-2' })
    const mailer = createResendMailer({ apiKey: 're_test', from: 'Hostmark <noreply@hostmark.tech>' }, fetchFn)

    // Act
    await mailer.send({ ...MESSAGE, replyTo: 'client@example.com' })

    // Assert
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toMatchObject({ reply_to: 'client@example.com' })
  })

  it('reports a refusal or an unreachable service without throwing', async () => {
    // Arrange
    const refused = createResendMailer({ apiKey: 're_test', from: 'a@b.co' }, reply({ message: 'domain not verified' }, false, 403))
    const offline = createResendMailer(
      { apiKey: 're_test', from: 'a@b.co' },
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )

    // Act + Assert
    expect(await refused.send(MESSAGE)).toEqual({ ok: false, reason: 'rejected_403' })
    expect(await offline.send(MESSAGE)).toEqual({ ok: false, reason: 'unreachable' })
  })
})
