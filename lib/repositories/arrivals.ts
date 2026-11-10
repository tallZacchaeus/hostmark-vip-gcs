// The arrivals board (FR-FT-03, 03-App-Flow.md /arrivals): everyone arriving on a day with live
// flight status, the pickup, its driver(s) and any pending suggestion. Runs as the signed-in
// coordinator; row-level security applies.
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'
import type { FlightPhase } from '@/lib/domain/flights/schedule'
import { type ArrivalBoardStatus, arrivalStatus, pickDay } from '@/lib/domain/transport/board'
import { zonedDateKey } from '@/lib/domain/time'
import { CURRENT_EVENT_ID } from '@/lib/db/current-event'

export interface ArrivalBoardRow {
  readonly arrival_id: string
  readonly delegation_id: string
  readonly delegation_name: string
  readonly principal_guest_id: string | null
  readonly principal_name: string | null
  readonly category: string | null
  readonly party_size: number
  readonly mode: 'flying' | 'own_transport' | 'pickup'
  readonly pickup_address: string | null
  /** Best known landing (or requested pickup) time. */
  readonly arrival_at: string | null
  readonly attention: string | null
  readonly status: ArrivalBoardStatus
  readonly flight: {
    readonly id: string
    readonly flight_number: string
    readonly phase: FlightPhase
    readonly delay_minutes: number | null
    readonly scheduled_arrival_at: string | null
    readonly manual_arrival_at: string | null
  } | null
  readonly pickup: {
    readonly id: string
    readonly status: string
    readonly pickup_at: string
    readonly previous_pickup_at: string | null
    readonly pickup_location: string
  } | null
  readonly drivers: string[]
  readonly suggestion: { readonly proposal_id: string; readonly kind: string; readonly driver_names: string | null } | null
}

export interface ArrivalsBoard {
  readonly day: string
  readonly days: string[]
  readonly timezone: string
  /** When flight data was last checked (any flight). */
  readonly updated_at: string | null
  readonly rows: ArrivalBoardRow[]
}

interface RawRow {
  readonly arrival_id: string
  readonly delegation_id: string
  readonly delegation_name: string
  readonly principal_guest_id: string | null
  readonly principal_name: string | null
  readonly category: string | null
  readonly party_size: number
  readonly mode: ArrivalBoardRow['mode']
  readonly pickup_address: string | null
  readonly arrival_status: string
  readonly arrival_at: Date | null
  readonly attention: string | null
  readonly flight_id: string | null
  readonly flight_number: string | null
  readonly phase: FlightPhase | null
  readonly delay_minutes: number | null
  readonly scheduled_arrival_at: Date | null
  readonly manual_arrival_at: Date | null
  readonly pickup_id: string | null
  readonly pickup_status: string | null
  readonly pickup_at: Date | null
  readonly previous_pickup_at: Date | null
  readonly pickup_location: string | null
  readonly drivers: string[]
  readonly suggestion_id: string | null
  readonly suggestion_kind: string | null
  readonly suggestion_drivers: string | null
}

const iso = (value: Date | null): string | null => (value ? new Date(value).toISOString() : null)

const ARRIVAL_AT = sql`coalesce(f.manual_arrival_at, f.actual_arrival_at, f.estimated_arrival_at, f.scheduled_arrival_at, a.stated_arrival_at, a.requested_pickup_at)`

function arrivalDay(timeZone: string) {
  return sql`coalesce(f.arrival_date_local, (${ARRIVAL_AT} at time zone ${timeZone})::date)`
}

async function arrivalDays(tx: Tx, timeZone: string): Promise<string[]> {
  const { rows } = await sql<{ day: string }>`
    select distinct ${arrivalDay(timeZone)}::text as day
    from public.arrivals a left join public.flights f on f.id = a.flight_id
    where a.status <> 'cancelled' and ${arrivalDay(timeZone)} is not null
    order by day`.execute(tx)
  return rows.map((row) => row.day)
}

async function rowsForDay(tx: Tx, day: string, timeZone: string): Promise<RawRow[]> {
  const { rows } = await sql<RawRow>`
    select a.id as arrival_id, d.id as delegation_id, d.name as delegation_name,
      g.id as principal_guest_id, nullif(concat_ws(' ', g.title, g.full_name), '') as principal_name, vc.name as category,
      (select count(*)::int from public.guests m where m.arrival_id = a.id and m.status <> 'cancelled') as party_size,
      a.mode, a.pickup_address, a.status as arrival_status, ${ARRIVAL_AT} as arrival_at, a.attention,
      f.id as flight_id, f.flight_number, f.phase, f.delay_minutes, f.scheduled_arrival_at, f.manual_arrival_at,
      p.id as pickup_id, p.status as pickup_status, p.pickup_at, p.previous_pickup_at, p.pickup_location,
      coalesce((
        select array_agg(dr.full_name order by dr.full_name) from public.pickup_assignments pa
        join public.drivers dr on dr.id = pa.driver_id where pa.pickup_id = p.id and pa.status in ('active', 'completed')
      ), '{}') as drivers,
      s.id as suggestion_id, s.kind as suggestion_kind,
      (select string_agg(dr.full_name, ' and ') from public.drivers dr
        where dr.id::text in (select jsonb_array_elements_text(s.payload -> 'driver_ids'))) as suggestion_drivers
    from public.arrivals a
    join public.delegations d on d.id = a.delegation_id
    left join public.guests g on g.id = d.principal_guest_id
    left join public.vip_categories vc on vc.id = g.vip_category_id
    left join public.flights f on f.id = a.flight_id
    left join lateral (
      select p0.* from public.pickups p0 where p0.arrival_id = a.id
      order by p0.status = 'cancelled', p0.pickup_at limit 1
    ) p on true
    left join lateral (
      select pr.id, pr.kind, pr.payload from public.proposals pr
      where pr.status = 'pending' and pr.target_type = 'pickups' and pr.target_id = p.id
      order by pr.created_at desc limit 1
    ) s on true
    where a.status <> 'cancelled' and ${arrivalDay(timeZone)} = ${day}::date
    order by ${ARRIVAL_AT} nulls last, d.name`.execute(tx)
  return rows
}

function toBoardRow(row: RawRow, delayThresholdMin: number): ArrivalBoardRow {
  return {
    arrival_id: row.arrival_id,
    delegation_id: row.delegation_id,
    delegation_name: row.delegation_name,
    principal_guest_id: row.principal_guest_id,
    principal_name: row.principal_name,
    category: row.category,
    party_size: row.party_size,
    mode: row.mode,
    pickup_address: row.pickup_address,
    arrival_at: iso(row.arrival_at),
    attention: row.attention,
    status: arrivalStatus({ phase: row.phase, delay_minutes: row.delay_minutes, arrival_status: row.arrival_status }, delayThresholdMin),
    flight:
      row.flight_id && row.flight_number && row.phase
        ? {
            id: row.flight_id,
            flight_number: row.flight_number,
            phase: row.phase,
            delay_minutes: row.delay_minutes,
            scheduled_arrival_at: iso(row.scheduled_arrival_at),
            manual_arrival_at: iso(row.manual_arrival_at),
          }
        : null,
    pickup:
      row.pickup_id && row.pickup_status && row.pickup_at
        ? { id: row.pickup_id, status: row.pickup_status, pickup_at: iso(row.pickup_at) ?? '', previous_pickup_at: iso(row.previous_pickup_at), pickup_location: row.pickup_location ?? '' }
        : null,
    drivers: row.drivers,
    suggestion: row.suggestion_id && row.suggestion_kind ? { proposal_id: row.suggestion_id, kind: row.suggestion_kind, driver_names: row.suggestion_drivers } : null,
  }
}

export async function loadArrivalsBoard(tx: Tx, requestedDay: string | undefined, now: Date): Promise<ArrivalsBoard | null> {
  const event = await tx.selectFrom('events').select(['timezone', 'delay_threshold_min']).where('id', '=', CURRENT_EVENT_ID).executeTakeFirst()
  if (!event) return null
  const days = await arrivalDays(tx, event.timezone)
  const day = pickDay(requestedDay, zonedDateKey(now, event.timezone), days)
  const rows = await rowsForDay(tx, day, event.timezone)
  const checked = await tx.selectFrom('flights').select(({ fn }) => fn.max('last_checked_at').as('at')).executeTakeFirst()
  return {
    day,
    days,
    timezone: event.timezone,
    updated_at: iso((checked?.at as Date | null | undefined) ?? null),
    rows: rows.map((row) => toBoardRow(row, event.delay_threshold_min)),
  }
}
