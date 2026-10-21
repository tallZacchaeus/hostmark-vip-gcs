// Before a manual move (FR-RA-06): which hard rules it breaks and which preferences it loses,
// compared with where the guest is now — the warning dialog's content. A dry run; runs as the
// coordinator and writes nothing. The database re-checks the hard rules when the move is made.
import { ApiError } from '@/lib/api/errors'
import type { Tx } from '@/lib/db/context'
import { type AllocRoom, BLOCKER_TEXT, roomBlocker } from '@/lib/domain/rooms/rules'
import { type PreferenceResult, type ScoreContext, guestPreferences, satisfaction } from '@/lib/domain/rooms/score'
import { loadGuests, loadRooms, loadStays } from './input'

export type Violation = { readonly code: string; readonly text: string }

export interface PreferenceChange {
  readonly code: PreferenceResult['code']
  readonly text: string
  readonly before: PreferenceResult['status'] | null
  readonly after: PreferenceResult['status']
}

export interface MoveCheck {
  readonly guest: { readonly id: string; readonly name: string; readonly role: string; readonly delegation: string }
  readonly from_room: RoomSummary | null
  readonly to_room: RoomSummary
  readonly violations: Violation[]
  /** Preferences that would be met less well than now. */
  readonly losses: PreferenceChange[]
  readonly score_before: number | null
  readonly score_after: number
  /** True when the move needs "assign anyway" with a reason. */
  readonly needs_confirmation: boolean
}

export interface RoomSummary {
  readonly id: string
  readonly number: string
  readonly type: string
  readonly wing: string
  readonly floor: number
  readonly is_accessible: boolean
}

const RANK: Readonly<Record<PreferenceResult['status'], number>> = { met: 2, partly: 1, missed: 0 }
const summary = (room: AllocRoom): RoomSummary => ({ id: room.id, number: room.number, type: room.type_name, wing: room.wing, floor: room.floor, is_accessible: room.is_accessible })

export async function checkMove(tx: Tx, guestId: string, roomId: string, now: Date): Promise<MoveCheck> {
  const [rooms, stays, guests] = [await loadRooms(tx), await loadStays(tx), await loadGuests(tx, [guestId], true)]
  const guest = guests[0]
  if (!guest) throw new ApiError(404, 'not_found', 'Guest not found, or no longer expected')
  const target = rooms.find((room) => room.id === roomId)
  if (!target) throw new ApiError(404, 'not_found', 'Room not found')
  const current = stays.find((stay) => stay.guest_id === guestId)
  const from = current ? rooms.find((room) => room.id === current.room_id) : undefined
  if (from?.id === target.id) throw new ApiError(409, 'same_room', 'The guest is already in this room')

  // The guest's stay window as public.assign_room computes it, so this dry run predicts its answer.
  const others = stays.filter((stay) => stay.guest_id !== guestId)
  const window = { check_in: guest.check_in, check_out: guest.check_out }
  const blocker = roomBlocker(target, { guest_ids: [guestId], share_group: guest.share_group, ...window }, others, now.getTime())
  const violations: Violation[] = [
    ...(blocker ? [{ code: blocker, text: BLOCKER_TEXT[blocker] }] : []),
    ...(current?.status === 'checked_in' ? [{ code: 'checked_in', text: BLOCKER_TEXT.checked_in }] : []),
  ]

  const placed = new Map(stays.map((stay) => [stay.guest_id, stay.room_id]))
  const context: ScoreContext = {
    lowest_floor: Math.min(...rooms.map((room) => room.floor)),
    principal_room: (principalId) => rooms.find((room) => room.id === placed.get(principalId)),
  }
  const before = from ? guestPreferences(guest, from, context) : null
  const after = guestPreferences(guest, target, context)
  const losses = after
    .map((result) => ({ result, previous: before?.find((item) => item.code === result.code) }))
    .filter(({ result, previous }) => previous !== undefined && RANK[result.status] < RANK[previous.status])
    .map(({ result, previous }) => ({ code: result.code, text: result.text, before: previous?.status ?? null, after: result.status }))
  return {
    guest: { id: guest.id, name: guest.name, role: guest.role_label, delegation: guest.delegation_name },
    from_room: from ? summary(from) : null,
    to_room: summary(target),
    violations,
    losses,
    score_before: before ? satisfaction(before) : null,
    score_after: satisfaction(after),
    needs_confirmation: violations.length > 0 || losses.length > 0,
  }
}
