// `pnpm worker`: the background worker as its own process, for when the app server runs with
// WORKER_MODE=off (e.g. several app instances). Stops cleanly on SIGINT/SIGTERM.
import { closeDatabase } from '@/lib/db/client'
import { getServerEnv } from '@/lib/env'
import { logger } from '@/lib/logger'
import { startWorker } from '@/lib/services/worker/runner'

const env = getServerEnv()
if (env.SERVICE_DATABASE_URL.startsWith('pglite://')) {
  // PGlite is one process's database: the app server must run the worker itself.
  logger.error('The worker cannot share a pglite:// database; use WORKER_MODE=in-process instead')
  process.exit(1)
}

const worker = startWorker()
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void worker
      .stop()
      .then(closeDatabase)
      .then(() => process.exit(0))
  })
}
// The worker's timers do not keep the process alive on their own.
setInterval(() => undefined, 60 * 60_000)
