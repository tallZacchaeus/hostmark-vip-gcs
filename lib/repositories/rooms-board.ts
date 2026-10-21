// The room grid (FR-RA-08, 03-App-Flow.md /rooms): every room with its status — out of service,
// cleaning, needs cleaning, occupied (checked in), reserved (a planned stay), proposed (a pending
// suggestion) or ready — its stays and suggestions, and the counts behind the summary tiles.
// Runs as the coordinator (RLS applies).
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'

export const ROOM_STATUSES = ['ready', 'proposed', 'reserved', 'occupied', 'needs-cleaning', 'cleaning', 'out-of-service'] as const
export type RoomBoardStatus = (typeof ROOM_STATUSES)[number]

export interface BoardStay {
  readonly assignment_id: string
  readonly guest_id: string
  readonly name: string
  readonly role: string
  readonly delegation_name: string
  readonly principal_guest_id: string | null
  readonly status: 'planned' | 'checked_in'
  readonly check_in: string
  readonly check_out: string
  readonly is_manual_override: boolean
}

export interface BoardSuggestion {
  readonly proposal_id: string
  readonly plan_id: string | null
  readonly guest_id: string
  readonly name: string
}

export interface BoardRoom {
  readonly id: string
  readonly number: string
  readonly floor: number
  readonly wing: string
  readonly position: number
  readonly type_name: string
  readonly tier: number
  readonly capacity: number
  readonly is_accessible: boolean
  readonly status: RoomBoardStatus
  readonly stays: BoardStay[]
  readonly suggestions: BoardSuggestion[]
}

export interface RoomsBoard {
  readonly rooms: BoardRoom[]
  readonly counts: Readonly<Record<RoomBoardStatus, number>>
  readonly pending_plan_id: string | null
  /** Guests expected or arrived with no room and no suggestion yet. */
  readonly unplaced: number
}

interface RoomRow extends Omit<BoardRoom, 'status' | 'stays' | 'suggestions'> {
  readonly out_of_service: boolean
  readonly housekeeping_status: 'clean' | 'needs_cleaning' | 'cleaning'
  readonly stays: BoardStay[] | null
  readonly suggestions: BoardSuggestion[] | null
}

export function roomStatus(row: Pick<RoomRow, 'out_of_service' | 'housekeeping_status'>, stays: readonly Pick<BoardStay, 'status'>[], suggested: boolean): RoomBoardStatus {
  if (row.out_of_service) return 'out-of-service'
  if (row.housekeeping_status === 'cleaning') return 'cleaning'
  if (row.housekeeping_status === 'needs_cleaning') return 'needs-cleaning'
  if (stays.some((stay) => stay.status === 'checked_in')) return 'occupied'
  if (stays.length > 0) return 'reserved'
  return suggested ? 'proposed' : 'ready'
}

const ROLE = sql`case g.member_role when 'principal' then 'Principal' when 'family' then 'Family' when 'assistant' then 'Assistant'
  when 'security' then 'Security' when 'performer' then 'Performer' when 'representative' then 'Representative' else 'Companion' end`
const NAME = sql`coalesce(nullif(concat_ws(' ', g.title, g.full_name), ''), 'Guest of ' || d.name)`

export async function loadRoomsBoard(tx: Tx): Promise<RoomsBoard> {
  const { rows } = await sql<RoomRow>`
    select r.id, r.number, r.floor, r.wing, r.position, rt.name as type_name, rt.tier, r.capacity, r.is_accessible,
      r.out_of_service, r.housekeeping_status,
      (select jsonb_agg(jsonb_build_object(
          'assignment_id', a.id, 'guest_id', g.id, 'name', ${NAME}, 'role', ${ROLE}, 'delegation_name', d.name,
          'principal_guest_id', d.principal_guest_id, 'status', a.status, 'check_in', a.expected_check_in_at,
          'check_out', a.expected_check_out_at, 'is_manual_override', a.is_manual_override
        ) order by a.expected_check_in_at)
        from public.room_assignments a join public.guests g on g.id = a.guest_id join public.delegations d on d.id = g.delegation_id
        where a.room_id = r.id and a.status in ('planned', 'checked_in')) as stays,
      (select jsonb_agg(jsonb_build_object('proposal_id', p.id, 'plan_id', p.parent_id, 'guest_id', g.id, 'name', ${NAME}))
        from public.proposals p
        left join public.proposals parent on parent.id = p.parent_id
        join public.guests g on g.id::text = p.payload ->> 'guest_id' join public.delegations d on d.id = g.delegation_id
        where p.kind = 'room_assignment' and p.status = 'pending' and p.payload ->> 'room_id' = r.id::text
          and (p.parent_id is null or parent.status = 'pending')) as suggestions
    from public.rooms r join public.room_types rt on rt.id = r.room_type_id
    order by r.floor desc, r.wing, r.position, r.number`.execute(tx)
  const rooms = rows.map(({ out_of_service, housekeeping_status, stays, suggestions, ...room }) => {
    const roomStays = stays ?? []
    const roomSuggestions = suggestions ?? []
    return { ...room, stays: roomStays, suggestions: roomSuggestions, status: roomStatus({ out_of_service, housekeeping_status }, roomStays, roomSuggestions.length > 0) }
  })
  const counts = Object.fromEntries(ROOM_STATUSES.map((status) => [status, rooms.filter((room) => room.status === status).length])) as Record<RoomBoardStatus, number>
  const plan = await tx.selectFrom('proposals').select('id').where('kind', '=', 'room_plan').where('status', '=', 'pending').orderBy('created_at', 'desc').executeTakeFirst()
  const { rows: waiting } = await sql<{ n: number }>`
    select count(*)::int as n from public.guests g
    where g.status in ('expected', 'arrived')
      and not exists (select 1 from public.room_assignments a where a.guest_id = g.id and a.status in ('planned', 'checked_in'))
      and not exists (select 1 from public.proposals p where p.kind = 'room_assignment' and p.status = 'pending' and p.target_id = g.id)`.execute(tx)
  return { rooms, counts, pending_plan_id: plan?.id ?? null, unplaced: waiting[0]?.n ?? 0 }
}
