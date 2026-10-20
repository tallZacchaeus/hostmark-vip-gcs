import { describe, expect, it, vi } from 'vitest'
import { createTurnstileCheck } from './turnstile'

const reply = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }))

describe('createTurnstileCheck', () => {
  it('is skipped when no secret is configured', async () => {
    const fetchFn = reply({ success: true })
    expect(await createTurnstileCheck(undefined, fetchFn).verify(undefined, '1.2.3.4')).toEqual({ ok: true, skipped: true })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('requires a token once configured', async () => {
    expect(await createTurnstileCheck('secret', reply({ success: true })).verify(undefined, '1.2.3.4')).toEqual({ ok: false, reason: 'missing_token' })
  })

  it('accepts a token Cloudflare confirms and sends the secret, token and IP', async () => {
    const fetchFn = reply({ success: true })
    expect(await createTurnstileCheck('secret', fetchFn).verify('token', '1.2.3.4')).toEqual({ ok: true, skipped: false })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({ secret: 'secret', response: 'token', remoteip: '1.2.3.4' })
  })

  it('refuses a token solved on another site', async () => {
    const check = createTurnstileCheck('secret', reply({ success: true, hostname: 'evil.example' }), 'ops.example.com')
    expect(await check.verify('token', '1.2.3.4')).toEqual({ ok: false, reason: 'wrong_hostname' })
    const ours = createTurnstileCheck('secret', reply({ success: true, hostname: 'ops.example.com' }), 'ops.example.com')
    expect(await ours.verify('token', '1.2.3.4')).toEqual({ ok: true, skipped: false })
  })

  it('fails closed when Cloudflare rejects the token or cannot be reached', async () => {
    expect(await createTurnstileCheck('secret', reply({ success: false })).verify('token', 'unknown')).toEqual({ ok: false, reason: 'rejected' })
    expect(await createTurnstileCheck('secret', reply({}, false)).verify('token', 'unknown')).toEqual({ ok: false, reason: 'verify_unavailable' })
    const offline = vi.fn(async () => {
      throw new Error('offline')
    })
    expect(await createTurnstileCheck('secret', offline).verify('token', 'unknown')).toEqual({ ok: false, reason: 'verify_unavailable' })
  })
})
