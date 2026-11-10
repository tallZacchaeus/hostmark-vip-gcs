import { describe, expect, it } from 'vitest'
import { contentSecurityPolicy, newNonce } from './csp'

const directive = (policy: string, name: string): string | undefined => policy.split('; ').find((part) => part.startsWith(`${name} `))

describe('Content-Security-Policy', () => {
  it('allows only scripts carrying this request\'s nonce (and what they load), never inline or eval in production', () => {
    const policy = contentSecurityPolicy('abc123', { development: false })
    expect(directive(policy, 'script-src')).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'")
    expect(policy).not.toMatch(/unsafe-eval/)
    expect(directive(policy, 'script-src')).not.toMatch(/unsafe-inline/)
  })

  it('locks down framing, plugins, base URLs and form targets, and allows the Turnstile frame', () => {
    const policy = contentSecurityPolicy('n', { development: false })
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("base-uri 'self'")
    expect(policy).toContain("form-action 'self'")
    expect(directive(policy, 'frame-src')).toBe('frame-src https://challenges.cloudflare.com')
    expect(directive(policy, 'connect-src')).toBe("connect-src 'self'")
  })

  it('lets the development server evaluate code for hot reloading', () => {
    expect(directive(contentSecurityPolicy('n', { development: true }), 'script-src')).toContain("'unsafe-eval'")
  })

  it('makes a fresh, unguessable nonce each time', () => {
    const first = newNonce()
    expect(first).toMatch(/^[A-Za-z0-9+/]{22,}={0,2}$/)
    expect(newNonce()).not.toBe(first)
  })
})
