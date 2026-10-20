// Keeps the worker going: a pass every 5 seconds (simulation steps), flight checks and driver
// suggestions every minute. Passes never overlap — the next one is scheduled when the last ends.
// Started by instrumentation.ts (WORKER_MODE=in-process) or worker/index.ts (`pnpm worker`).
import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import { getServerEnv } from '@/lib/env'
import { getSystemDb } from '@/lib/db/system'
import { logger } from '@/lib/logger'
import { runWorkerTick } from './tick'

const TICK_MS = 5_000
const POLL_EVERY_MS = 60_000

export interface WorkerHandle {
  stop(): Promise<void>
}

const RUNNING = Symbol.for('vip-gcs.worker')
type WorkerGlobal = typeof globalThis & { [RUNNING]?: WorkerHandle }

export function startWorker(): WorkerHandle {
  const global = globalThis as WorkerGlobal
  // Dev reloads re-run instrumentation; keep one worker per process.
  const existing = global[RUNNING]
  if (existing) return existing

  const env = getServerEnv()
  const holder = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`
  let lastPoll = 0
  let timer: NodeJS.Timeout | undefined
  let current: Promise<void> = Promise.resolve()
  let stopped = false

  const pass = async (): Promise<void> => {
    const now = new Date()
    const poll = now.getTime() - lastPoll >= POLL_EVERY_MS
    try {
      const report = await runWorkerTick(getSystemDb(), { holder, now, poll, aeroDataBoxKey: env.AERODATABOX_API_KEY, dailyLimit: env.FLIGHT_POLL_DAILY_LIMIT })
      if (report && poll) lastPoll = now.getTime()
    } catch (error) {
      logger.error('Worker pass failed', { error })
    }
  }
  const schedule = (): void => {
    if (stopped) return
    timer = setTimeout(() => {
      current = pass().finally(schedule)
    }, TICK_MS)
    timer.unref()
  }

  const handle: WorkerHandle = {
    async stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      await current
      delete global[RUNNING]
    },
  }
  global[RUNNING] = handle
  logger.info('Worker started', { holder })
  schedule()
  return handle
}
