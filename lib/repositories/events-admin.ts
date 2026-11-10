// Managing events (P9 step 9.4): the Events page of Programme Managers and Super Admins. Creating
// goes through row-level security (the creator becomes the owner); the rest acts on an event other
// than the request's own, so it runs through the security-definer functions of migration
// 20261112100000_event_management.sql, which check that the person manages that event.
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'
import type { CopyPart, EventCreate, EventStatus } from '@/lib/validation/event'
import type { EventRow } from './event'

export interface ManagedEvent {
  readonly id: string
  readonly name: string
  readonly venue_name: string
  readonly status: EventStatus
  readonly starts_on: string
  readonly ends_on: string
  readonly owner_id: string | null
  readonly owner_name: string | null
  readonly member_count: number
  readonly is_current: boolean
}

export interface StaffOption {
  readonly id: string
  readonly full_name: string
  readonly email: string
  readonly role: string
  readonly is_member: boolean
}

export type CopyCounts = Partial<Record<'room_types' | 'rooms' | 'categories' | 'drivers' | 'staff', number>>

export async function listManageableEvents(tx: Tx): Promise<ManagedEvent[]> {
  const { rows } = await sql<{ events: ManagedEvent[] }>`select public.manageable_events() as events`.execute(tx)
  return rows[0]?.events ?? []
}

/** A new event starts as a draft owned by its creator. */
export async function createEvent(tx: Tx, values: EventCreate): Promise<EventRow> {
  return tx.insertInto('events').values(values).returningAll().executeTakeFirstOrThrow()
}

export async function setEventStatus(tx: Tx, eventId: string, status: EventStatus): Promise<EventStatus> {
  const { rows } = await sql<{ status: EventStatus }>`select public.set_event_status(${eventId}::uuid, ${status}) as status`.execute(tx)
  return rows[0]?.status ?? status
}

export async function listEventStaff(tx: Tx, eventId: string): Promise<StaffOption[]> {
  const { rows } = await sql<{ staff: StaffOption[] }>`select public.event_staff(${eventId}::uuid) as staff`.execute(tx)
  return rows[0]?.staff ?? []
}

export async function setEventMember(tx: Tx, eventId: string, profileId: string, member: boolean): Promise<void> {
  await sql`select public.set_event_member(${eventId}::uuid, ${profileId}::uuid, ${member})`.execute(tx)
}

export async function copyEventSetup(tx: Tx, targetId: string, sourceId: string, parts: readonly CopyPart[]): Promise<CopyCounts> {
  const { rows } = await sql<{ counts: CopyCounts }>`
    select public.copy_event_setup(${targetId}::uuid, ${sourceId}::uuid, ${[...parts]}::text[]) as counts`.execute(tx)
  return rows[0]?.counts ?? {}
}
