import { afterAll, describe, expect, it, vi } from 'vitest'
import { setMailerForTesting } from '@/lib/mail/get-mailer'
import type { MailMessage, Mailer } from '@/lib/mail/mailer'
import { POST } from './route'

vi.stubEnv('DATABASE_URL', 'pglite://memory')
vi.stubEnv('SERVICE_DATABASE_URL', 'pglite://memory')
vi.stubEnv('BETTER_AUTH_SECRET', 'route-test-secret-'.padEnd(48, 'x'))
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
vi.stubEnv('DEMO_REQUEST_TO', 'sales@example.com')

const sent: MailMessage[] = []
const mailer: Mailer = {
  enabled: true,
  async send(message) {
    sent.push(message)
    return { ok: true, id: `email-${sent.length}` }
  },
}
setMailerForTesting(mailer)
afterAll(() => setMailerForTesting(undefined))

const BODY = { name: 'Ada Nwosu', organisation: 'Lagos Leadership Forum', email: 'ada@example.com' }
const NO_PARAMS = { params: Promise.resolve({}) }

function post(body: unknown, ip: string): Promise<Response> {
  const request = new Request('http://localhost:3000/api/demo-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
  return POST(request, NO_PARAMS)
}

describe('POST /api/demo-requests', () => {
  it('emails a valid request to the team and says it was received', async () => {
    // Act
    const response = await post(BODY, '203.0.113.1')

    // Assert
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ success: true, data: { received: true } })
    expect(sent.at(-1)).toMatchObject({ to: 'sales@example.com', replyTo: 'ada@example.com' })
  })

  it('names the fields that are missing or invalid', async () => {
    // Act
    const response = await post({ ...BODY, email: 'nope' }, '203.0.113.2')

    // Assert
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ success: false, error: { code: 'validation_failed' } })
  })

  it('allows five requests from one address in ten minutes, then asks it to wait', async () => {
    // Arrange
    const ip = '203.0.113.3'
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await post(BODY, ip)).status).toBe(201)
    }

    // Act
    const blocked = await post(BODY, ip)
    const otherAddress = await post(BODY, '203.0.113.4')

    // Assert
    expect(blocked.status).toBe(429)
    expect(otherAddress.status).toBe(201)
  })
})
