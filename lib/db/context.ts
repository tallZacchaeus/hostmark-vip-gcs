// Runs work inside a transaction as a specific database role. `set_config(..., true)` is
// transaction-local, so a pooled connection never carries one request's identity into the next.
import { type Kysely, type Transaction, sql } from 'kysely'
import type { DB } from './types'

export type Tx = Transaction<DB>

/**
 * As the API role (vip_app) acting for `userId`: row-level security applies. `eventId`: the event
 * the request works in (P9); the database accepts it only if the person works on it, otherwise it
 * falls back to their chosen event.
 */
export async function withUser<T>(db: Kysely<DB>, userId: string, fn: (tx: Tx) => Promise<T>, eventId?: string): Promise<T> {
  return db.transaction().execute(async (tx) => {
    await sql`select set_config('role', 'vip_app', true), set_config('app.user_id', ${userId}, true),
      set_config('app.event_id', ${eventId ?? ''}, true)`.execute(tx)
    return fn(tx)
  })
}
