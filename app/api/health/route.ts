// Liveness and database check for the droplet's uptime monitor and Docker healthcheck.
// Public and deliberately minimal: it reveals nothing about the event or its data.
import { sql } from 'kysely'
import { jsonError, jsonOk } from '@/lib/api/response'
import { getDb } from '@/lib/db/client'
import { logger } from '@/lib/logger'

export async function GET(): Promise<Response> {
  try {
    await sql`select 1`.execute(getDb())
    return jsonOk({ status: 'ok', database: 'ok' })
  } catch (error: unknown) {
    logger.error('Health check failed', { error })
    return jsonError(503, { code: 'unavailable', message: 'Database unavailable' })
  }
}
