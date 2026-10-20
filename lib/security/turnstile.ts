// Bot check for the public registration form (FR-IN-02): Cloudflare Turnstile, verified on the
// server. Without TURNSTILE_SECRET_KEY the check is skipped (development, or before the keys are
// issued) and per-IP rate limiting is the only protection. A configured check fails closed.

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const VERIFY_TIMEOUT_MS = 5_000

export type BotCheckResult = { readonly ok: true; readonly skipped: boolean } | { readonly ok: false; readonly reason: string }

export interface BotCheck {
  verify(token: string | undefined, ip: string): Promise<BotCheckResult>
}

type FetchLike = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>

/** `expectedHostname`: a token solved on another site (replayed here) is refused. */
export function createTurnstileCheck(secret: string | undefined, fetchFn: FetchLike = fetch, expectedHostname?: string): BotCheck {
  return {
    async verify(token, ip) {
      if (!secret) return { ok: true, skipped: true }
      if (!token) return { ok: false, reason: 'missing_token' }
      const body = new URLSearchParams({ secret, response: token })
      if (ip !== 'unknown') body.set('remoteip', ip)
      try {
        const response = await fetchFn(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) })
        if (!response.ok) return { ok: false, reason: 'verify_unavailable' }
        const result = (await response.json()) as { success?: unknown; hostname?: unknown }
        if (result.success !== true) return { ok: false, reason: 'rejected' }
        if (expectedHostname && typeof result.hostname === 'string' && result.hostname !== expectedHostname) {
          return { ok: false, reason: 'wrong_hostname' }
        }
        return { ok: true, skipped: false }
      } catch {
        return { ok: false, reason: 'verify_unavailable' }
      }
    },
  }
}
