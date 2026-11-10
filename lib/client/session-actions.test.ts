import { afterEach, describe, expect, it, vi } from 'vitest'
import { signIn } from './session-actions'

function respondWith(status: number, body: unknown): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })))
}

async function failure(): Promise<{ code: string; message: string }> {
  return signIn('coordinator@vipgcs.test', 'Some-password-1').then(
    () => {
      throw new Error('expected sign-in to fail')
    },
    (error: { code: string; message: string }) => error,
  )
}

describe('signIn failures', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('says the password is incorrect only when the credentials were refused', async () => {
    respondWith(401, { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' })
    expect(await failure()).toMatchObject({ code: 'invalid_credentials', message: 'Email or password is incorrect.' })
  })

  it('treats a malformed email as incorrect details', async () => {
    respondWith(400, { code: 'INVALID_EMAIL', message: 'Invalid email' })
    expect(await failure()).toMatchObject({ code: 'invalid_credentials', message: 'Email or password is incorrect.' })
  })

  it('does not blame the password when the address is not allowed to sign in', async () => {
    respondWith(403, { code: 'INVALID_ORIGIN', message: 'Invalid origin' })
    const error = await failure()
    expect(error.code).toBe('wrong_address')
    expect(error.message).toMatch(/address/)
    expect(error.message).not.toMatch(/password/i)
  })

  it('does not blame the password when the server fails', async () => {
    respondWith(500, {})
    const error = await failure()
    expect(error.code).toBe('sign_in_unavailable')
    expect(error.message).not.toMatch(/password/i)
  })

  it('says so when the account is deactivated', async () => {
    respondWith(403, { code: 'BANNED_USER', message: 'You have been banned' })
    expect(await failure()).toMatchObject({ code: 'account_inactive', message: 'This account has been deactivated.' })
  })

  it('asks the user to wait when rate limited', async () => {
    respondWith(429, {})
    expect(await failure()).toMatchObject({ code: 'rate_limited' })
  })
})
