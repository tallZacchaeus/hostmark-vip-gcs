import { describe, expect, it } from 'vitest'
import { createRateLimiter } from './rate-limit'

describe('createRateLimiter', () => {
  it('allows up to the limit within a window, then refuses with a retry time', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 })
    expect(limiter.check('ip-1', 0)).toEqual({ allowed: true, remaining: 1, retryAfterSeconds: 0 })
    expect(limiter.check('ip-1', 1_000)).toEqual({ allowed: true, remaining: 0, retryAfterSeconds: 0 })
    expect(limiter.check('ip-1', 15_000)).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 45 })
  })

  it('starts a fresh window after the previous one ends', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 })
    limiter.check('ip-1', 0)
    expect(limiter.check('ip-1', 60_000).allowed).toBe(true)
  })

  it('counts each key separately', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 })
    limiter.check('ip-1', 0)
    expect(limiter.check('ip-2', 0).allowed).toBe(true)
  })

  it('forgets expired keys once it holds too many', () => {
    const limiter = createRateLimiter({ windowMs: 1_000, max: 1, maxKeys: 2 })
    limiter.check('a', 0)
    limiter.check('b', 0)
    limiter.check('c', 5_000)
    expect(limiter.size()).toBeLessThanOrEqual(2)
  })

  it('rejects nonsensical settings', () => {
    expect(() => createRateLimiter({ windowMs: 0, max: 1 })).toThrow()
    expect(() => createRateLimiter({ windowMs: 1_000, max: 0 })).toThrow()
  })
})
