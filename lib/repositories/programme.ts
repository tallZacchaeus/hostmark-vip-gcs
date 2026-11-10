// The programme for one day (FR-PG-04, Figma "Programme"): items in time order with their
// participants, who is late and why the item is at risk, the venues in use and the event's days.
// Runs as the signed-in user: coordinators see published and cancelled items, editors see drafts too.
// Items left outside the event days (when the dates change) are listed under `outside_days`, so none
// is ever hidden.
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'
import { type ItemState, type ProgramStatus, eventDays, itemState, venueCounts } from '@/lib/domain/programme/timeline'
import { pickDay } from '@/lib/domain/transport/board'
import { addDays, zonedDateKey, zonedDayStart } from '@/lib/domain/time'

export interface ProgramParticipant {
  readonly guest_id: string
  readonly delegation_id: string
  readonly name: string
  readonly role: 'speaker' | 'honoree' | 'performer' | 'attendee'
  readonly category: string | null
  readonly expected_at: string | null
  readonly arrived: boolean
  /** This participant puts the item at risk. */
  readonly late: boolean
}

export interface ProgramItemView {
  readonly id: string
  readonly title: string
  readonly kind: 'session' | 'ceremony' | 'meal' | 'performance' | 'other'
  readonly starts_at: string
  readonly ends_at: string
  readonly location: string
  readonly description: string | null
  readonly status: ProgramStatus
  readonly at_risk: boolean
  readonly state: ItemState
  readonly risk_notified_at: string | null
  readonly participants: ProgramParticipant[]
}

export interface ProgrammeView {
  readonly day: string
  readonly days: string[]
  /** Days with items that fall outside the event days (only after the event dates changed). */
  readonly outside_days: string[]
  readonly timezone: string
  readonly lead_time_min: number
  readonly can_edit: boolean
  readonly at_risk_count: number
  readonly venues: { name: string; count: number }[]
  readonly items: ProgramItemView[]
}

export interface ProgrammeGuest {
  readonly id: string
  readonly name: string
  readonly delegation: string
  readonly category: string | null
}

interface ItemRow extends Omit<ProgramItemView, 'starts_at' | 'ends_at' | 'risk_notified_at' | 'state' | 'participants'> {
  readonly starts_at: Date
  readonly ends_at: Date
  readonly risk_notified_at: Date | null
  readonly participants: (Omit<ProgramParticipant, 'expected_at'> & { expected_at: string | null })[] | null
}

const iso = (value: Date | null): string | null => (value ? new Date(value).toISOString() : null)

async function eventSettings(tx: Tx): Promise<{ timezone: string; starts_on: string; ends_on: string; lead_time_min: number }> {
  const { rows } = await sql<{ timezone: string; starts_on: string; ends_on: string; lead_time_min: number }>`
    select timezone, starts_on::text, ends_on::text, program_lead_time_min as lead_time_min from public.events limit 1`.execute(tx)
  const event = rows[0]
  if (!event) throw new Error('No event is set up')
  return event
}

async function itemsBetween(tx: Tx, from: string, to: string): Promise<ItemRow[]> {
  const { rows } = await sql<ItemRow>`
    select i.id, i.title, i.kind, i.starts_at, i.ends_at, i.location, i.description, i.status, i.at_risk, i.risk_notified_at,
      (select json_agg(json_build_object(
          'guest_id', g.id, 'delegation_id', g.delegation_id, 'name', concat_ws(' ', g.title, g.full_name), 'role', pp.role,
          'category', vc.name, 'expected_at', coalesce(a.expected_at_venue_at, a.stated_arrival_at, a.requested_pickup_at),
          'arrived', g.status in ('arrived', 'checked_in', 'checked_out') or a.status = 'arrived',
          'late', g.id = any (late.ids)
        ) order by pp.role, vc.rank nulls last, g.full_name)
       from public.program_participants pp
       cross join lateral (select coalesce(array_agg(r.guest_id), '{}') as ids from private.program_item_risks(i.id) r) late
       join public.guests g on g.id = pp.guest_id
       left join public.vip_categories vc on vc.id = g.vip_category_id
       left join public.arrivals a on a.id = g.arrival_id
       where pp.program_item_id = i.id) as participants
    from public.program_items i
    where i.starts_at >= ${from}::timestamptz and i.starts_at < ${to}::timestamptz
    order by i.starts_at, i.title`.execute(tx)
  return rows
}

async function daysOutside(tx: Tx, timezone: string, startsOn: string, endsOn: string): Promise<string[]> {
  const { rows } = await sql<{ day: string }>`
    select distinct (starts_at at time zone ${timezone})::date::text as day
    from public.program_items
    where (starts_at at time zone ${timezone})::date not between ${startsOn}::date and ${endsOn}::date
    order by 1`.execute(tx)
  return rows.map((row) => row.day)
}

export async function loadProgramme(tx: Tx, requestedDay: string | undefined, now: Date, canEdit: boolean): Promise<ProgrammeView> {
  const event = await eventSettings(tx)
  const days = eventDays(event.starts_on, event.ends_on)
  const day = pickDay(requestedDay, zonedDateKey(now, event.timezone), days)
  const rows = await itemsBetween(tx, zonedDayStart(day, event.timezone), zonedDayStart(addDays(day, 1), event.timezone))
  const outsideDays = await daysOutside(tx, event.timezone, event.starts_on, event.ends_on)
  const items = rows.map(({ starts_at, ends_at, risk_notified_at, participants, ...rest }): ProgramItemView => {
    const item = { ...rest, starts_at: iso(starts_at) ?? '', ends_at: iso(ends_at) ?? '', risk_notified_at: iso(risk_notified_at) }
    return {
      ...item,
      state: itemState(item, now.getTime()),
      participants: (participants ?? []).map((participant) => ({ ...participant, expected_at: participant.expected_at ? new Date(participant.expected_at).toISOString() : null })),
    }
  })
  return {
    day,
    days: days.length > 0 ? days : [day],
    outside_days: outsideDays,
    timezone: event.timezone,
    lead_time_min: event.lead_time_min,
    can_edit: canEdit,
    at_risk_count: items.filter((item) => item.state === 'risk').length,
    venues: venueCounts(items),
    items,
  }
}

/** Guests the editors can list as participants (not cancelled), best category first. */
export async function loadProgrammeGuests(tx: Tx): Promise<ProgrammeGuest[]> {
  const { rows } = await sql<ProgrammeGuest>`
    select g.id, concat_ws(' ', g.title, g.full_name) as name, d.name as delegation, vc.name as category
    from public.guests g
    join public.delegations d on d.id = g.delegation_id
    left join public.vip_categories vc on vc.id = g.vip_category_id
    where g.status <> 'cancelled'
    order by vc.rank nulls last, g.full_name
    limit 1000`.execute(tx)
  return rows
}
