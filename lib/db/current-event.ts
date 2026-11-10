// The event a transaction works in (P9): private.current_event_id(). For signed-in people it is the
// event they chose (or their only/live one) and only if they work on it; for system work, the event
// set by inSystemEvent() (lib/db/system.ts). Use it wherever code reads "the" event.
import { type Kysely, sql } from 'kysely'
import { withUser } from './context'
import type { DB } from './types'

/** For Kysely `where('id', '=', CURRENT_EVENT_ID)` on events, or `event_id` columns. */
export const CURRENT_EVENT_ID = sql<string>`private.current_event_id()`

/**
 * The event a signed-in person's request works in: `requested` (the X-Event-Id the screen sent) if
 * they work on it, else null; without one, their chosen event (or their live one); null when none.
 */
export async function resolveCurrentEventId(db: Kysely<DB>, userId: string, requested?: string): Promise<string | null> {
  return withUser(
    db,
    userId,
    async (tx) => {
      const { rows } = await sql<{ id: string | null }>`select private.current_event_id() as id`.execute(tx)
      return rows[0]?.id ?? null
    },
    requested,
  )
}
