// Counters for the coordinator dashboard ("At a glance" and the KPI tiles). Each phase adds its
// own counters here; all run as the signed-in user, so row-level security applies.
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'
import { zonedDateKey } from '@/lib/domain/time'
import { loadProgramme } from '@/lib/repositories/programme'

export interface RoomCounts {
  readonly total: number
  readonly ready: number
  readonly needs_cleaning: number
  readonly cleaning: number
  readonly out_of_service: number
}

export interface GuestCounts {
  readonly guests: number
  readonly delegations: number
}

export interface ArrivalCounts {
  readonly total: number
  readonly flying: number
  readonly by_road: number
}

export interface PickupCounts {
  readonly total: number
  readonly needs_driver: number
}

/** A guest whose expected arrival puts a programme item at risk. */
export interface LateParticipant {
  readonly guest_id: string
  readonly name: string
  readonly expected_at: string | null
}

/** A published programme item today that a late arrival puts at risk (the dashboard glance card). */
export interface ProgrammeRisk {
  readonly id: string
  readonly title: string
  readonly starts_at: string
  readonly location: string
  readonly late: LateParticipant[]
}

export interface DashboardSummary {
  readonly rooms: RoomCounts
  readonly decisions_pending: number
  readonly guests: GuestCounts
  readonly arrivals_today: ArrivalCounts
  readonly pickups_today: PickupCounts
  readonly intake_to_review: number
  readonly programme_at_risk: ProgrammeRisk[]
}

/** "Today" is the event's calendar day: the zone comes from the event row itself. */
const EVENT_TODAY = (now: Date) => sql<string>`(${now.toISOString()}::timestamptz at time zone (select e.timezone from public.events e limit 1))::date`

/** Free as on the Rooms board: nobody planned or in it, and no pending suggestion for it. */
const FREE = sql`not exists (select 1 from public.room_assignments a where a.room_id = rooms.id and a.status in ('planned', 'checked_in'))
  and not exists (
    select 1 from public.proposals p left join public.proposals parent on parent.id = p.parent_id
    where p.kind = 'room_assignment' and p.status = 'pending' and p.payload ->> 'room_id' = rooms.id::text
      and (p.parent_id is null or parent.status = 'pending')
  )`

export async function countRooms(tx: Tx): Promise<RoomCounts> {
  const row = await tx
    .selectFrom('rooms')
    .select([
      sql<number>`count(*)::int`.as('total'),
      sql<number>`(count(*) filter (where housekeeping_status = 'clean' and not out_of_service and ${FREE}))::int`.as('ready'),
      sql<number>`(count(*) filter (where housekeeping_status = 'needs_cleaning' and not out_of_service))::int`.as('needs_cleaning'),
      sql<number>`(count(*) filter (where housekeeping_status = 'cleaning' and not out_of_service))::int`.as('cleaning'),
      sql<number>`(count(*) filter (where out_of_service))::int`.as('out_of_service'),
    ])
    .executeTakeFirstOrThrow()
  return row
}

/** Open top-level proposals that have not expired (the same rule as the decisions queue). */
export async function countPendingDecisions(tx: Tx): Promise<number> {
  const row = await tx
    .selectFrom('proposals')
    .where('status', '=', 'pending')
    .where('parent_id', 'is', null)
    .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', sql<Date>`now()`)]))
    .select(sql<number>`count(*)::int`.as('n'))
    .executeTakeFirstOrThrow()
  return row.n
}

export async function countGuests(tx: Tx): Promise<GuestCounts> {
  const { rows: [row] } = await sql<GuestCounts>`
    select (select count(*)::int from public.guests where status <> 'cancelled') as guests,
      (select count(*)::int from public.delegations where status <> 'cancelled') as delegations`.execute(tx)
  return row ?? { guests: 0, delegations: 0 }
}

export async function countArrivalsToday(tx: Tx, now: Date): Promise<ArrivalCounts> {
  const { rows: [row] } = await sql<ArrivalCounts>`
    select count(*)::int as total,
      (count(*) filter (where a.mode = 'flying'))::int as flying,
      (count(*) filter (where a.mode <> 'flying'))::int as by_road
    from public.arrivals a
    left join public.flights f on f.id = a.flight_id
    where a.status <> 'cancelled'
      and coalesce(
        f.arrival_date_local,
        (coalesce(a.stated_arrival_at, a.requested_pickup_at) at time zone (select e.timezone from public.events e limit 1))::date
      ) = ${EVENT_TODAY(now)}`.execute(tx)
  return row ?? { total: 0, flying: 0, by_road: 0 }
}

export async function countPickupsToday(tx: Tx, now: Date): Promise<PickupCounts> {
  const { rows: [row] } = await sql<PickupCounts>`
    select count(*)::int as total,
      (count(*) filter (where p.status = 'pending_assignment'))::int as needs_driver
    from public.pickups p
    where p.status <> 'cancelled'
      and (p.pickup_at at time zone (select e.timezone from public.events e limit 1))::date = ${EVENT_TODAY(now)}`.execute(tx)
  return row ?? { total: 0, needs_driver: 0 }
}

export async function countIntakeToReview(tx: Tx): Promise<number> {
  const row = await tx
    .selectFrom('intake_submissions')
    .where('status', '=', 'needs_review')
    .select(sql<number>`count(*)::int`.as('n'))
    .executeTakeFirstOrThrow()
  return row.n
}

/**
 * Today's published items at risk, read through the Programme screen's own logic so both agree.
 * Empty until the event is set up, and on days outside the event.
 */
export async function listProgrammeAtRiskToday(tx: Tx, now: Date): Promise<ProgrammeRisk[]> {
  const { rows } = await sql<{ timezone: string }>`select timezone from public.events limit 1`.execute(tx)
  const timezone = rows[0]?.timezone
  if (!timezone) return []
  const today = zonedDateKey(now, timezone)
  const view = await loadProgramme(tx, today, now, false)
  return view.items
    .filter((item) => item.state === 'risk' && item.status === 'published')
    .map((item) => ({
      id: item.id,
      title: item.title,
      starts_at: item.starts_at,
      location: item.location,
      late: item.participants
        .filter((participant) => participant.late)
        .map((participant) => ({ guest_id: participant.guest_id, name: participant.name, expected_at: participant.expected_at })),
    }))
}

export async function readDashboardSummary(tx: Tx, now: Date): Promise<DashboardSummary> {
  // One connection per transaction: these run one after another, so await them in turn.
  const rooms = await countRooms(tx)
  const decisions = await countPendingDecisions(tx)
  const guests = await countGuests(tx)
  const arrivals = await countArrivalsToday(tx, now)
  const pickups = await countPickupsToday(tx, now)
  const intake = await countIntakeToReview(tx)
  const programmeAtRisk = await listProgrammeAtRiskToday(tx, now)
  return {
    rooms,
    decisions_pending: decisions,
    guests,
    arrivals_today: arrivals,
    pickups_today: pickups,
    intake_to_review: intake,
    programme_at_risk: programmeAtRisk,
  }
}
