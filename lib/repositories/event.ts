// The single event's settings (FR-PL-03). Row-level security: Admin writes; coordinators and the
// programs team read; everyone signed in gets the safe context via get_event_context().
import { type Selectable, sql } from 'kysely'
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

export async function findEvent(tx: Tx): Promise<EventRow | undefined> {
  return tx.selectFrom('events').selectAll().executeTakeFirst()
}

export async function insertEvent(tx: Tx, values: EventCreate): Promise<EventRow> {
  return tx.insertInto('events').values(values).returningAll().executeTakeFirstOrThrow()
}

export async function updateEvent(tx: Tx, values: EventUpdate): Promise<EventRow | undefined> {
  return tx.updateTable('events').set(values).returningAll().executeTakeFirst()
}

export async function regenerateIntakeToken(tx: Tx): Promise<string> {
  const { rows } = await sql<{ token: string }>`select public.regenerate_intake_token() as token`.execute(tx)
  return rows[0]?.token ?? ''
}

export async function findEventContext(tx: Tx): Promise<EventContext | null> {
  const { rows } = await sql<{ context: EventContext | null }>`select public.get_event_context() as context`.execute(tx)
  return rows[0]?.context ?? null
}
