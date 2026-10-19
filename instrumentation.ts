// Runs once when the server starts: fail fast on missing or weak configuration instead of on
// the first request.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getServerEnv } = await import('./lib/env')
    getServerEnv()
  }
}
