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
    if (process.env.VERCEL && env.WORKER_MODE === 'in-process') {
      const { logger } = await import('./lib/logger')
      logger.warn('WORKER_MODE=in-process on Vercel: instances are suspended between requests, so set WORKER_MODE=off and schedule /api/internal/worker-tick (docs/02-TRD.md §5.2)')
    }
    // The background worker (flight checks, simulation steps, driver suggestions); not while building.
    if (env.WORKER_MODE === 'in-process' && process.env.NEXT_PHASE !== 'phase-production-build') {
      const { startWorker } = await import('./lib/services/worker/runner')
      startWorker()
    }
  }
}
