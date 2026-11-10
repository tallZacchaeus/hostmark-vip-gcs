// The current event's settings (FR-PL-03): the event this request works in, private.current_event_id()
// (P9). Row-level security: Admin writes; coordinators and the programs team read; everyone signed in
// gets the safe context via get_event_context().
import { type Selectable, sql } from 'kysely'
import { CURRENT_EVENT_ID } from '@/lib/db/current-event'
import type { Tx } from '@/lib/db/context'
import type { Events } from '@/lib/db/types'
import type { EventUpdate } from '@/lib/validation/event'

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
  return tx.selectFrom('events').selectAll().where('id', '=', CURRENT_EVENT_ID).executeTakeFirst()
}

export async function updateEvent(tx: Tx, values: EventUpdate): Promise<EventRow | undefined> {
  return tx.updateTable('events').set(values).where('id', '=', CURRENT_EVENT_ID).returningAll().executeTakeFirst()
}

export async function regenerateIntakeToken(tx: Tx): Promise<string> {
  const { rows } = await sql<{ token: string }>`select public.regenerate_intake_token() as token`.execute(tx)
  return rows[0]?.token ?? ''
}

/** An event the signed-in person works on (public.my_events()). */
export interface MyEvent {
  readonly id: string
  readonly name: string
  readonly status: 'draft' | 'live' | 'archived'
  readonly starts_on: string
  readonly ends_on: string
  readonly is_owner: boolean
  readonly is_current: boolean
}

export async function listMyEvents(tx: Tx): Promise<MyEvent[]> {
  const { rows } = await sql<{ events: MyEvent[] }>`select public.my_events() as events`.execute(tx)
  return rows[0]?.events ?? []
}

/** Switch the event this person works in (only one they work on; otherwise "not found"). */
export async function setActiveEvent(tx: Tx, eventId: string): Promise<void> {
  await sql`select public.set_active_event(${eventId}::uuid)`.execute(tx)
}

export async function findEventContext(tx: Tx): Promise<EventContext | null> {
  const { rows } = await sql<{ context: EventContext | null }>`select public.get_event_context() as context`.execute(tx)
  return rows[0]?.context ?? null
}
