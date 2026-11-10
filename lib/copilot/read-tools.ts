// Co-Pilot read tools about people and flights (FR-CP-02): arrivals in a window, one guest, one
// flight, and who a flight affects. Parameterized queries run as the signed-in user, so row-level
// security applies exactly as on the screens.
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'
import type { ArrivalFilter, ArrivalWindow } from '@/lib/domain/copilot/intent'
import { addDays, zonedDateKey, zonedDayStart } from '@/lib/domain/time'
import { type ToolAnswer, type ToolContext, guestCitation, listOf, plural, time } from './text'

const HOUR_MS = 60 * 60_000
const ARRIVAL_TIME = sql`coalesce(f.manual_arrival_at, f.actual_arrival_at, f.estimated_arrival_at, f.scheduled_arrival_at, a.stated_arrival_at, a.requested_pickup_at)`

interface ArrivalRow {
  readonly delegation_id: string
  readonly name: string
  readonly party_size: number
  readonly flight_number: string | null
  readonly delay_minutes: number | null
  readonly arrives_at: Date | null
}

function windowFor(window: ArrivalWindow, hours: number | null, context: ToolContext): { from: string; to: string; label: string } {
  if (window === 'next_hours') {
    const span = hours ?? 1
    return { from: context.now.toISOString(), to: new Date(context.now.getTime() + span * HOUR_MS).toISOString(), label: `in the next ${plural(span, 'hour')}` }
  }
  const today = zonedDateKey(context.now, context.timezone)
  const day = window === 'tomorrow' ? addDays(today, 1) : today
  return { from: zonedDayStart(day, context.timezone), to: zonedDayStart(addDays(day, 1), context.timezone), label: window }
}

const FILTERS: Readonly<Record<ArrivalFilter, ReturnType<typeof sql>>> = {
  all: sql`true`,
  missing_driver: sql`exists (select 1 from public.pickups p where p.arrival_id = a.id and p.status not in ('cancelled', 'completed')
    and not exists (select 1 from public.pickup_assignments pa where pa.pickup_id = p.id and pa.status = 'active'))`,
  room_not_ready: sql`exists (select 1 from public.guests g2 join public.room_assignments ra on ra.guest_id = g2.id and ra.status = 'planned'
    join public.rooms r on r.id = ra.room_id where g2.arrival_id = a.id and (r.housekeeping_status <> 'clean' or r.out_of_service))`,
  delayed: sql`coalesce(f.delay_minutes, 0) > 0`,
}

const FILTER_WORDS: Readonly<Record<ArrivalFilter, string>> = {
  all: '',
  missing_driver: ' without a driver',
  room_not_ready: ' whose room is not ready',
  delayed: ' on a delayed flight',
}

export async function findArrivals(tx: Tx, args: { window: ArrivalWindow; hours: number | null; filter: ArrivalFilter }, context: ToolContext): Promise<ToolAnswer> {
  const range = windowFor(args.window, args.hours, context)
  const { rows } = await sql<ArrivalRow>`
    select d.id as delegation_id, coalesce(nullif(concat_ws(' ', pg.title, pg.full_name), ''), d.name) as name,
      (select count(*)::int from public.guests g where g.arrival_id = a.id and g.status <> 'cancelled') as party_size,
      f.flight_number, f.delay_minutes, ${ARRIVAL_TIME} as arrives_at
    from public.arrivals a
    join public.delegations d on d.id = a.delegation_id
    left join public.guests pg on pg.id = d.principal_guest_id
    left join public.flights f on f.id = a.flight_id
    where a.status <> 'cancelled' and ${ARRIVAL_TIME} >= ${range.from}::timestamptz and ${ARRIVAL_TIME} < ${range.to}::timestamptz
      and ${FILTERS[args.filter]}
    order by ${ARRIVAL_TIME}`.execute(tx)
  const subject = `${plural(rows.length, 'party', 'parties')} arriving ${range.label}${FILTER_WORDS[args.filter]}`
  if (rows.length === 0) return { answer: `No ${subject.replace(/^0 /, '')}.`, citations: [] }
  const items = rows.map((row) => `${row.name} (${[row.flight_number, time(row.arrives_at, context), row.delay_minutes ? `${row.delay_minutes} min late` : null, plural(row.party_size, 'person', 'people')].filter(Boolean).join(', ')})`)
  return { answer: `${subject[0]?.toUpperCase()}${subject.slice(1)}: ${listOf(items)}.`, citations: rows.map((row) => guestCitation(row.name, row.delegation_id)) }
}

interface GuestRow {
  readonly delegation_id: string
  readonly name: string
  readonly status: string
  readonly category: string | null
  readonly flight_number: string | null
  readonly arrives_at: Date | null
  readonly room: string | null
  readonly stay_status: string | null
  readonly pickup_at: Date | null
  readonly drivers: string | null
  readonly notes: number
}

export async function getGuest(tx: Tx, args: { guest_id: string }, context: ToolContext): Promise<ToolAnswer> {
  const { rows } = await sql<GuestRow>`
    select g.delegation_id, concat_ws(' ', g.title, g.full_name) as name, g.status, vc.name as category, f.flight_number,
      ${ARRIVAL_TIME} as arrives_at, r.number as room, ra.status as stay_status, p.pickup_at,
      (select string_agg(dr.full_name, ', ') from public.pickup_assignments pa join public.drivers dr on dr.id = pa.driver_id
        where pa.pickup_id = p.id and pa.status = 'active') as drivers,
      (select count(*)::int from public.guest_requirements q where q.guest_id = g.id and q.resolved_at is null) as notes
    from public.guests g
    left join public.vip_categories vc on vc.id = g.vip_category_id
    left join public.arrivals a on a.id = g.arrival_id
    left join public.flights f on f.id = a.flight_id
    left join public.room_assignments ra on ra.guest_id = g.id and ra.status in ('planned', 'checked_in')
    left join public.rooms r on r.id = ra.room_id
    left join lateral (select p0.* from public.pickups p0 where p0.arrival_id = a.id and p0.status <> 'cancelled' order by p0.pickup_at limit 1) p on true
    where g.id = ${args.guest_id}`.execute(tx)
  const guest = rows[0]
  if (!guest) return { answer: 'I could not find that guest.', citations: [] }
  const parts = [
    `${guest.name}${guest.category ? ` (${guest.category})` : ''} is ${guest.status.replace('_', ' ')}.`,
    guest.flight_number ? `Arrives on ${guest.flight_number} at ${time(guest.arrives_at, context)}.` : guest.arrives_at ? `Expected at ${time(guest.arrives_at, context)}.` : null,
    guest.room ? `Room ${guest.room} (${guest.stay_status === 'checked_in' ? 'checked in' : 'planned'}).` : 'No room yet.',
    guest.pickup_at ? `Pickup at ${time(guest.pickup_at, context)}${guest.drivers ? ` with ${guest.drivers}` : ', no driver yet'}.` : null,
    guest.notes > 0 ? `${plural(guest.notes, 'open note')}.` : null,
  ]
  return { answer: parts.filter(Boolean).join(' '), citations: [guestCitation(guest.name, guest.delegation_id)] }
}

interface FlightRow {
  readonly flight_number: string
  readonly phase: string
  readonly scheduled_arrival_at: Date | null
  readonly best_at: Date | null
  readonly delay_minutes: number | null
  readonly parties: { delegation_id: string; name: string }[] | null
}

async function loadFlight(tx: Tx, flightNumber: string): Promise<FlightRow | undefined> {
  const { rows } = await sql<FlightRow>`
    select f.flight_number, f.phase, f.scheduled_arrival_at,
      coalesce(f.manual_arrival_at, f.actual_arrival_at, f.estimated_arrival_at, f.scheduled_arrival_at) as best_at, f.delay_minutes,
      (select json_agg(json_build_object('delegation_id', d.id, 'name', coalesce(nullif(concat_ws(' ', pg.title, pg.full_name), ''), d.name)))
       from public.arrivals a join public.delegations d on d.id = a.delegation_id left join public.guests pg on pg.id = d.principal_guest_id
       where a.flight_id = f.id and a.status <> 'cancelled') as parties
    from public.flights f where upper(f.flight_number) = upper(${flightNumber})
    order by f.arrival_date_local limit 1`.execute(tx)
  return rows[0]
}

const PHASES: Readonly<Record<string, string>> = { scheduled: 'is scheduled', in_air: 'is in the air', landed: 'has landed', cancelled: 'is cancelled', diverted: 'was diverted', unknown: 'has no live status' }

export async function getFlightStatus(tx: Tx, args: { flight_number: string }, context: ToolContext): Promise<ToolAnswer> {
  const flight = await loadFlight(tx, args.flight_number)
  if (!flight) return { answer: `I have no flight ${args.flight_number}.`, citations: [] }
  const parties = flight.parties ?? []
  const delay = flight.delay_minutes && flight.delay_minutes > 0 ? `, ${flight.delay_minutes} minutes late` : ''
  const answer = `${flight.flight_number} ${PHASES[flight.phase] ?? flight.phase}: ${flight.phase === 'landed' ? 'landed' : 'expected'} at ${time(flight.best_at, context)}${delay} (scheduled ${time(flight.scheduled_arrival_at, context)}). On board: ${parties.length ? listOf(parties.map((party) => party.name)) : 'no party'}.`
  return { answer, citations: [{ label: flight.flight_number, href: '/arrivals' }, ...parties.map((party) => guestCitation(party.name, party.delegation_id))] }
}

export async function whoIsAffected(tx: Tx, args: { flight_number: string }, context: ToolContext): Promise<ToolAnswer> {
  const flight = await loadFlight(tx, args.flight_number)
  if (!flight) return { answer: `I have no flight ${args.flight_number}.`, citations: [] }
  const { rows } = await sql<{ pickups: number; items: string[] | null }>`
    select (select count(*)::int from public.pickups p join public.arrivals a on a.id = p.arrival_id join public.flights f on f.id = a.flight_id
            where upper(f.flight_number) = upper(${args.flight_number}) and p.status not in ('cancelled', 'completed')) as pickups,
      (select array_agg(distinct i.title) from public.program_items i join public.program_participants pp on pp.program_item_id = i.id
         join public.guests g on g.id = pp.guest_id join public.arrivals a on a.id = g.arrival_id join public.flights f on f.id = a.flight_id
       where upper(f.flight_number) = upper(${args.flight_number}) and i.status = 'published'
         and i.ends_at > ${context.now.toISOString()}::timestamptz) as items`.execute(tx)
  const extra = rows[0]
  const parties = flight.parties ?? []
  const answer = [
    `${flight.flight_number}${flight.delay_minutes ? ` (${flight.delay_minutes} min late)` : ''} carries ${parties.length ? listOf(parties.map((party) => party.name)) : 'no party'}.`,
    `${plural(extra?.pickups ?? 0, 'pickup')} depend on it.`,
    extra?.items?.length ? `Programme items with its passengers: ${listOf(extra.items)}.` : 'No programme item depends on it.',
  ].join(' ')
  return { answer, citations: [{ label: flight.flight_number, href: '/arrivals' }, ...parties.map((party) => guestCitation(party.name, party.delegation_id)), ...(extra?.items?.length ? [{ label: 'Programme', href: '/programme' }] : [])] }
}
