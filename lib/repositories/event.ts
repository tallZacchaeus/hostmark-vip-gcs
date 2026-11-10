// The current event's settings (FR-PL-03): the event this request works in, private.current_event_id()
// (P9). Row-level security: Admin writes; coordinators and the programs team read; everyone signed in
// gets the safe context via get_event_context().
import { type Selectable, sql } from 'kysely'
import { ApiError } from '@/lib/api/errors'
import type { Tx } from '@/lib/db/context'
import type { Events } from '@/lib/db/types'
import type { EventCreate, EventUpdate } from '@/lib/validation/event'

export type EventRow = Selectable<Events>

export interface EventContext {
  readonly id: string
  readonly name: string
  readonly venue_name: string
  readonly timezone: string
  readonly starts_on: string
  readonly ends_on: string
  readonly flight_mode: 'live' | 'simulated'
  /** The coordination desk's phone (E.164), or null when not set. */
  readonly coordinator_phone: string | null
}

const CURRENT_EVENT = sql<string>`private.current_event_id()`

export async function findEvent(tx: Tx): Promise<EventRow | undefined> {
  return tx.selectFrom('events').selectAll().where('id', '=', CURRENT_EVENT).executeTakeFirst()
}

/**
 * First-time setup from Settings → System; the database makes the creator its owner. Refused once
 * an event exists: more events come from the Events page (P9 step 9.4).
 */
export async function insertEvent(tx: Tx, values: EventCreate): Promise<EventRow> {
  const existing = await tx.selectFrom('events').select('id').limit(1).executeTakeFirst()
  if (existing) {
    throw new ApiError(409, 'already_exists', 'The event is already set up')
  }
  return tx.insertInto('events').values(values).returningAll().executeTakeFirstOrThrow()
}

export async function updateEvent(tx: Tx, values: EventUpdate): Promise<EventRow | undefined> {
  return tx.updateTable('events').set(values).where('id', '=', CURRENT_EVENT).returningAll().executeTakeFirst()
}

export async function regenerateIntakeToken(tx: Tx): Promise<string> {
  const { rows } = await sql<{ token: string }>`select public.regenerate_intake_token() as token`.execute(tx)
  return rows[0]?.token ?? ''
}

export async function findEventContext(tx: Tx): Promise<EventContext | null> {
  const { rows } = await sql<{ context: EventContext | null }>`select public.get_event_context() as context`.execute(tx)
  return rows[0]?.context ?? null
}
