// One pass of the background worker, called by a scheduler where no process stays running
// (Vercel: Supabase pg_cron calls this every minute with ?poll=1, and every few seconds while a
// simulation runs; docs/02-TRD.md §5.2). The droplet runs the worker in-process instead.
// Authorized by `Authorization: Bearer <CRON_SECRET>` (the header Vercel Cron also sends) and
// absent (404) when CRON_SECRET is unset, so it never exists by accident.
import { jsonError, jsonOk } from '@/lib/api/response'
import { getSystemDb } from '@/lib/db/system'
import { getServerEnv } from '@/lib/env'
import { logger } from '@/lib/logger'
import { isAuthorizedScheduler } from '@/lib/security/scheduler-auth'
import { runWorkerTick } from '@/lib/services/worker/tick'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Every scheduled call shares one lease holder: each call is a fresh invocation, and a per-call
// holder would be locked out by the previous call's lease for LEASE_MS. Calls that overlap are
// safe: simulation steps are claimed one by one, and only ?poll=1 calls check flights.
const SCHEDULER_HOLDER = 'scheduler'

export async function GET(request: Request): Promise<Response> {
  const env = getServerEnv()
  if (!env.CRON_SECRET) {
    return jsonError(404, { code: 'not_found', message: 'Not found' })
  }
  if (!isAuthorizedScheduler(request.headers.get('authorization'), env.CRON_SECRET)) {
    return jsonError(401, { code: 'unauthenticated', message: 'Scheduler credentials required' })
  }

  const poll = new URL(request.url).searchParams.get('poll') === '1'
  try {
    const report = await runWorkerTick(getSystemDb(), {
      holder: SCHEDULER_HOLDER,
      now: new Date(),
      poll,
      aeroDataBoxKey: env.AERODATABOX_API_KEY,
      dailyLimit: env.FLIGHT_POLL_DAILY_LIMIT,
    })
    return jsonOk({ ran: report !== null, report })
  } catch (error: unknown) {
    logger.error('Scheduled worker pass failed', { error, poll })
    return jsonError(500, { code: 'internal_error', message: 'Worker pass failed' })
  }
}
