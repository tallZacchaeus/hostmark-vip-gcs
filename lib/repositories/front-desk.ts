// The front desk (FR-RA-09, Figma "Front desk"): parties arriving on a day with their rooms and
// whether every room is ready, parties in house, and parties leaving that day. One card per
// delegation (the party is checked in together). Runs as the front desk or a coordinator (RLS).
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'
import { pickDay } from '@/lib/domain/transport/board'
import { addDays, zonedDateKey, zonedDayStart } from '@/lib/domain/time'

export type DeskTab = 'arriving' | 'in_house' | 'leaving'

export interface DeskParty {
  readonly delegation_id: string
  readonly principal_guest_id: string | null
  readonly name: string
  readonly category: string | null
  readonly party_size: number
  readonly rooms: string[]
  readonly rooms_ready: boolean
  /** Driver on the way or the guests already picked up. */
  readonly on_the_way: boolean
  readonly check_in: string
  readonly check_out: string
  readonly checked_in_at: string | null
  readonly checked_in_by: string | null
}

export interface FrontDesk {
  readonly day: string
  readonly timezone: string
  readonly arriving: DeskParty[]
  readonly in_house: DeskParty[]
  readonly leaving: DeskParty[]
}

interface PartyRow extends Omit<DeskParty, 'check_in' | 'check_out' | 'checked_in_at'> {
  readonly stay_status: 'planned' | 'checked_in'
  readonly check_in: Date
  readonly check_out: Date
  readonly checked_in_at: Date | null
}

const iso = (value: Date | null): string | null => (value ? new Date(value).toISOString() : null)

async function parties(tx: Tx): Promise<PartyRow[]> {
  const { rows } = await sql<PartyRow>`
    select d.id as delegation_id, d.principal_guest_id,
      coalesce(nullif(concat_ws(' ', p.title, p.full_name), ''), d.name) as name, vc.name as category,
      count(*)::int as party_size,
      array_agg(r.number order by g.id = d.principal_guest_id desc, r.number) as rooms,
      bool_and(r.housekeeping_status = 'clean' and not r.out_of_service) as rooms_ready,
      exists (
        select 1 from public.arrivals ar join public.pickups pk on pk.arrival_id = ar.id
        where ar.delegation_id = d.id and pk.status in ('en_route', 'picked_up')
      ) as on_the_way,
      a.status as stay_status,
      min(a.expected_check_in_at) as check_in, max(a.expected_check_out_at) as check_out,
      max(a.checked_in_at) as checked_in_at,
      (select pr.full_name from public.profiles pr where pr.id = (array_agg(a.checked_in_by order by a.checked_in_at desc nulls last))[1]) as checked_in_by
    from public.room_assignments a
    join public.guests g on g.id = a.guest_id
    join public.delegations d on d.id = g.delegation_id
    join public.rooms r on r.id = a.room_id
    left join public.guests p on p.id = d.principal_guest_id
    left join public.vip_categories vc on vc.id = p.vip_category_id
    where a.status in ('planned', 'checked_in')
    group by d.id, p.id, vc.name, a.status
    order by min(a.expected_check_in_at)`.execute(tx)
  return rows
}

// The principal's room first (the key tag shows it), then the others by number, each once.
const toParty = ({ stay_status: _status, rooms, check_in, check_out, checked_in_at, ...rest }: PartyRow): DeskParty => ({
  ...rest,
  rooms: [...new Set(rooms)],
  check_in: iso(check_in) ?? '',
  check_out: iso(check_out) ?? '',
  checked_in_at: iso(checked_in_at),
})

export async function loadFrontDesk(tx: Tx, requestedDay: string | undefined, now: Date): Promise<FrontDesk> {
  const event = await sql<{ timezone: string }>`select (public.get_event_context() ->> 'timezone') as timezone`.execute(tx)
  const timezone = event.rows[0]?.timezone ?? 'UTC'
  const rows = await parties(tx)
  const planned = rows.filter((row) => row.stay_status === 'planned')
  const days = [...new Set(planned.map((row) => zonedDateKey(row.check_in, timezone)))]
  const day = pickDay(requestedDay, zonedDateKey(now, timezone), days)
  const end = new Date(zonedDayStart(addDays(day, 1), timezone)).getTime()
  const start = new Date(zonedDayStart(day, timezone)).getTime()
  const inHouse = rows.filter((row) => row.stay_status === 'checked_in')
  return {
    day,
    timezone,
    // Everyone due by the end of the day who is not in yet (late parties stay on the list).
    arriving: planned.filter((row) => new Date(row.check_in).getTime() < end).map(toParty),
    in_house: inHouse.map(toParty),
    leaving: inHouse.filter((row) => new Date(row.check_out).getTime() >= start && new Date(row.check_out).getTime() < end).map(toParty),
  }
}
