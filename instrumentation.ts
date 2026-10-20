// Runs once when the server starts: fail fast on missing or weak configuration instead of on
// the first request.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getServerEnv } = await import('./lib/env')
    const env = getServerEnv()
    if (env.NODE_ENV === 'production' && !(env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY)) {
      const { logger } = await import('./lib/logger')
      logger.warn('Cloudflare Turnstile is not configured: the public registration form is protected by rate limits only')
    }
  }
}
