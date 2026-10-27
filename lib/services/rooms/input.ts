// What the allocator works on (02-TRD.md §3.4): the venue's rooms with readiness, every current
// stay, and the guests who still need a room — with their VIP rank (from the principal's
// category), proximity priority, share group, accessibility needs and stay window (the same
// private.guest_stay_window the database uses). Reads only; runs as the coordinator or vip_system.
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'
import type { AllocationInput } from '@/lib/domain/rooms/allocator'
import type { AllocRoom, HousekeepingStatus, Occupant } from '@/lib/domain/rooms/rules'
import type { AllocGuest, ProximityPriority } from '@/lib/domain/rooms/score'

const ROLE_LABELS: Readonly<Record<string, string>> = {
  principal: 'Principal',
  family: 'Family',
  assistant: 'Assistant',
  security: 'Security',
  performer: 'Performer',
  representative: 'Representative',
  other: 'Companion',
}

const ms = (value: Date | string): number => new Date(value).getTime()

export async function loadRooms(tx: Tx): Promise<AllocRoom[]> {
  const { rows } = await sql<Omit<AllocRoom, 'housekeeping_status' | 'ready_at'> & { housekeeping_status: HousekeepingStatus; ready_at: Date | null }>`
    select r.id, r.number, r.floor, r.wing, r.position, rt.name as type_name, rt.tier, r.capacity, r.is_accessible,
      r.out_of_service, r.housekeeping_status, rt.cleaning_minutes + e.cleaning_delay_buffer_min as turnaround_min,
      private.room_ready_at(r.id) as ready_at
    from public.rooms r
    join public.room_types rt on rt.id = r.room_type_id
    join public.events e on e.id = r.event_id
    order by r.floor, r.wing, r.position, r.number`.execute(tx)
  return rows.map((row) => ({ ...row, ready_at: row.ready_at === null ? null : ms(row.ready_at) }))
}

export interface CurrentStay extends Occupant {
  readonly assignment_id: string
  readonly status: 'planned' | 'checked_in'
}

export async function loadStays(tx: Tx): Promise<CurrentStay[]> {
  const { rows } = await sql<{ assignment_id: string; room_id: string; guest_id: string; share_group: string | null; check_in: Date; check_out: Date; status: CurrentStay['status'] }>`
    select a.id as assignment_id, a.room_id, a.guest_id, g.share_group, a.expected_check_in_at as check_in,
      a.expected_check_out_at as check_out, a.status
    from public.room_assignments a
    join public.guests g on g.id = a.guest_id
    where a.status in ('planned', 'checked_in')`.execute(tx)
  return rows.map((row) => ({ ...row, check_in: ms(row.check_in), check_out: ms(row.check_out) }))
}

interface GuestRow {
  readonly id: string
  readonly name: string
  readonly member_role: string
  readonly delegation_id: string
  readonly delegation_name: string
  readonly principal_id: string | null
  readonly rank: number | null
  readonly preferred_tier: number | null
  readonly proximity: ProximityPriority
  readonly share_group: string | null
  readonly needs_accessible: boolean
  readonly wants_ground_floor: boolean
  readonly check_in: Date
  readonly check_out: Date
}

/**
 * Guests expected or arrived (not cancelled) — all of them, or only those listed. A manual move
 * also looks at checked-in guests (`includeCheckedIn`); the allocator never moves them.
 */
export async function loadGuests(tx: Tx, guestIds?: readonly string[], includeCheckedIn = false): Promise<AllocGuest[]> {
  const only = guestIds ? sql`and g.id = any (${[...guestIds]}::uuid[])` : sql``
  const statuses = includeCheckedIn ? ['expected', 'arrived', 'checked_in'] : ['expected', 'arrived']
  const { rows } = await sql<GuestRow>`
    select g.id,
      coalesce(nullif(concat_ws(' ', g.title, g.full_name), ''), 'Guest of ' || d.name) as name,
      g.member_role, d.id as delegation_id, d.name as delegation_name, d.principal_guest_id as principal_id,
      vc.rank, vc.preferred_room_tier as preferred_tier, g.proximity_priority as proximity, g.share_group,
      (nullif(btrim(g.accessibility), '') is not null or exists (
        select 1 from public.guest_requirements r where r.guest_id = g.id and r.category = 'accessibility'
      )) as needs_accessible,
      (nullif(btrim(g.accessibility), '') is not null or exists (
        select 1 from public.guest_requirements r where r.guest_id = g.id
          and (r.category = 'accessibility' or (r.category = 'room_preference' and r.detail ilike '%ground%'))
      )) as wants_ground_floor,
      lower(private.guest_stay_window(g.id)) as check_in, upper(private.guest_stay_window(g.id)) as check_out
    from public.guests g
    join public.delegations d on d.id = g.delegation_id
    left join public.guests p on p.id = d.principal_guest_id
    left join public.vip_categories vc on vc.id = p.vip_category_id
    where g.status::text = any (${statuses}::text[]) ${only}
    order by d.name, g.member_role = 'principal' desc, g.created_at`.execute(tx)
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    role_label: ROLE_LABELS[row.member_role] ?? 'Companion',
    delegation_id: row.delegation_id,
    delegation_name: row.delegation_name,
    is_principal: row.member_role === 'principal' || row.principal_id === row.id,
    principal_id: row.principal_id,
    rank: row.rank,
    preferred_tier: row.preferred_tier,
    proximity: row.proximity,
    share_group: row.share_group,
    needs_accessible: row.needs_accessible,
    wants_ground_floor: row.wants_ground_floor,
    check_in: ms(row.check_in),
    check_out: ms(row.check_out),
  }))
}

export interface RoomWorld {
  readonly rooms: AllocRoom[]
  readonly stays: CurrentStay[]
  /** Guests who need a room and have none. */
  readonly unplaced: AllocGuest[]
}

export async function loadRoomWorld(tx: Tx): Promise<RoomWorld> {
  const [rooms, stays, guests] = [await loadRooms(tx), await loadStays(tx), await loadGuests(tx)]
  const placed = new Set(stays.map((stay) => stay.guest_id))
  return { rooms, stays, unplaced: guests.filter((guest) => !placed.has(guest.id)) }
}

/** The allocator's input for `guests`, around everything already placed. */
export function allocationInput(world: Pick<RoomWorld, 'rooms' | 'stays'>, guests: readonly AllocGuest[], now: Date): AllocationInput {
  return {
    rooms: world.rooms,
    occupants: world.stays,
    placed: new Map(world.stays.map((stay) => [stay.guest_id, stay.room_id])),
    guests,
    now: now.getTime(),
  }
}

export interface PendingRoom extends Occupant {
  readonly parent_id: string | null
}

/**
 * Rooms named by pending room proposals (single ones, and lines of a pending plan), held for the
 * guest's stay window as it is now: that is the window the proposal is checked for when approved.
 * Payload ids are compared as text, so a malformed payload is skipped rather than failing the read.
 */
export async function pendingRoomHolds(tx: Tx): Promise<PendingRoom[]> {
  const { rows } = await sql<{ guest_id: string; room_id: string; share_group: string | null; check_in: Date; check_out: Date; parent_id: string | null }>`
    select g.id as guest_id, r.id as room_id, g.share_group,
      lower(private.guest_stay_window(g.id)) as check_in, upper(private.guest_stay_window(g.id)) as check_out, p.parent_id
    from public.proposals p
    join public.guests g on g.id::text = p.payload ->> 'guest_id'
    join public.rooms r on r.id::text = p.payload ->> 'room_id'
    left join public.proposals parent on parent.id = p.parent_id
    where p.kind = 'room_assignment' and p.status = 'pending' and (p.parent_id is null or parent.status = 'pending')`.execute(tx)
  return rows.map((row) => ({ ...row, check_in: new Date(row.check_in).getTime(), check_out: new Date(row.check_out).getTime() }))
}

/** The world with pending suggestions' rooms counted as taken. */
export const withHolds = (world: RoomWorld, holds: readonly Occupant[]): RoomWorld => ({ ...world, stays: [...world.stays, ...holds.map((hold) => ({ ...hold, assignment_id: '', status: 'planned' as const }))] })
