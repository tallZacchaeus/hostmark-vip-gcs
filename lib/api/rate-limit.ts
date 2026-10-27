// Fixed-window rate limiter kept in process memory. The droplet runs a single app process, so
// one in-memory limiter per route is enough; a multi-instance deploy would need a shared store.
// On Vercel each function instance keeps its own windows (Fluid compute reuses instances, so
// limits still apply per instance): a known limit of that host, see docs/02-TRD.md §5.2.

export interface RateLimitResult {
  readonly allowed: boolean
  readonly remaining: number
  readonly retryAfterSeconds: number
}

export interface RateLimiter {
  check(key: string, now?: number): RateLimitResult
  size(): number
}

export interface RateLimiterOptions {
  readonly windowMs: number
  readonly max: number
  /** Upper bound on tracked keys before expired ones are dropped. */
  readonly maxKeys?: number
}

interface Window {
  readonly start: number
  readonly count: number
}

const DEFAULT_MAX_KEYS = 10_000

export function createRateLimiter({ windowMs, max, maxKeys = DEFAULT_MAX_KEYS }: RateLimiterOptions): RateLimiter {
  if (!(windowMs > 0) || !Number.isInteger(max) || max < 1) {
    throw new RangeError('Rate limiter needs a positive window and a max of at least 1')
  }

  let windows = new Map<string, Window>()

  function prune(now: number): void {
    if (windows.size <= maxKeys) {
      return
    }
    const live = [...windows].filter(([, window]) => now - window.start < windowMs)
    // If everything is still live, keep the most recent keys.
    windows = new Map(live.slice(-maxKeys))
  }

  return {
    check(key: string, now: number = Date.now()): RateLimitResult {
      const current = windows.get(key)
      const window: Window = !current || now - current.start >= windowMs ? { start: now, count: 0 } : current

      if (window.count >= max) {
        const retryAfterSeconds = Math.ceil((window.start + windowMs - now) / 1000)
        return { allowed: false, remaining: 0, retryAfterSeconds }
      }

      const next: Window = { start: window.start, count: window.count + 1 }
      windows.set(key, next)
      prune(now)
      return { allowed: true, remaining: max - next.count, retryAfterSeconds: 0 }
    },
    size: () => windows.size,
  }
}
