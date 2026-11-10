// What a scripted run acts on, chosen once when it starts (FR-PL-10) so every step hits the same
// records: the next flights to land with guests on board, the rooms of the next planned stays, and
// the next delegations due in that already have rooms (so the worker's room suggestions are on).
// Runs as the coordinator (RLS: coordinator+). Reads only.
import { sql } from 'kysely'
import { ApiError } from '@/lib/api/errors'
import type { Tx } from '@/lib/db/context'
import { type Scenario, type TargetKind, targetsNeeded } from '@/lib/domain/simulation/scenarios'

/** A chosen target and the time the story centres on (landing, or the guests' expected check-in). */
interface Target {
  readonly id: string
  readonly at: Date
}

export interface RunTargets {
  readonly flight_ids: string[]
  readonly room_ids: string[]
  readonly delegation_ids: string[]
  /** When the first target's story happens: virtual time starts a little before it. */
  readonly first_at: Date | null
}

/** The next flights to land that someone is still arriving on. */
async function upcomingFlights(tx: Tx, limit: number): Promise<Target[]> {
  const { rows } = await sql<Target>`
    select f.id, coalesce(f.manual_arrival_at, f.actual_arrival_at, f.estimated_arrival_at, f.scheduled_arrival_at) as at
    from public.flights f
    where f.phase not in ('landed', 'cancelled', 'diverted')
      and coalesce(f.manual_arrival_at, f.actual_arrival_at, f.estimated_arrival_at, f.scheduled_arrival_at) is not null
      and exists (select 1 from public.arrivals a where a.flight_id = f.id and a.status = 'expected')
    order by at, f.flight_number
    limit ${limit}`.execute(tx)
  return rows
}

/** Rooms in service holding a current stay: planned stays first (they can be moved), soonest first. */
async function roomsWithStays(tx: Tx, limit: number): Promise<Target[]> {
  const { rows } = await sql<Target>`
    select r.id, min(a.expected_check_in_at) as at
    from public.rooms r
    join public.room_assignments a on a.room_id = r.id and a.status in ('planned', 'checked_in')
    where not r.out_of_service
    group by r.id, r.number
    order by bool_and(a.status = 'checked_in'), min(a.expected_check_in_at), r.number
    limit ${limit}`.execute(tx)
  return rows
}

/** Delegations with a principal and at least one guest in a room: not yet checked in first, soonest first. */
async function delegationsWithRooms(tx: Tx, limit: number): Promise<Target[]> {
  const { rows } = await sql<Target>`
    select d.id, min(a.expected_check_in_at) as at
    from public.delegations d
    join public.guests g on g.delegation_id = d.id
    join public.room_assignments a on a.guest_id = g.id and a.status in ('planned', 'checked_in')
    where d.principal_guest_id is not null
    group by d.id, d.name
    order by bool_and(a.status = 'checked_in'), min(a.expected_check_in_at), d.name
    limit ${limit}`.execute(tx)
  return rows
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : `${n} ${many}`)

const SOURCES: Readonly<Record<TargetKind, { load: (tx: Tx, limit: number) => Promise<Target[]>; code: string; message: (n: number) => string }>> = {
  flight: {
    load: upcomingFlights,
    code: 'not_enough_flights',
    message: (n) => `This scenario needs ${n} upcoming ${n === 1 ? 'flight' : 'flights'} with guests on board`,
  },
  room: {
    load: roomsWithStays,
    code: 'not_enough_rooms',
    message: (n) => `This scenario needs ${plural(n, 'a room', 'rooms')} with guests planned in. Approve some room assignments first.`,
  },
  delegation: {
    load: delegationsWithRooms,
    code: 'not_enough_delegations',
    message: (n) => `This scenario needs ${plural(n, 'a delegation', 'delegations')} with rooms already planned. Approve some room assignments first.`,
  },
}

async function choose(tx: Tx, scenario: Scenario, kind: TargetKind): Promise<Target[]> {
  const needed = targetsNeeded(scenario, kind)
  if (needed === 0) return []
  const source = SOURCES[kind]
  const found = await source.load(tx, needed)
  if (found.length < needed) throw new ApiError(409, source.code, source.message(needed))
  return found
}

export async function chooseTargets(tx: Tx, scenario: Scenario): Promise<RunTargets> {
  const flights = await choose(tx, scenario, 'flight')
  const rooms = await choose(tx, scenario, 'room')
  const delegations = await choose(tx, scenario, 'delegation')
  const first = flights[0] ?? rooms[0] ?? delegations[0]
  return {
    flight_ids: flights.map((target) => target.id),
    room_ids: rooms.map((target) => target.id),
    delegation_ids: delegations.map((target) => target.id),
    first_at: first ? new Date(first.at) : null,
  }
}
