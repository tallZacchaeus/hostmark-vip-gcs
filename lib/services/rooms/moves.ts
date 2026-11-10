// What happens to stays whose room no longer works for them (FR-RA-01, FR-RA-07): each planned stay
// moves to the allocator's best other room, or there is no room for it; a checked-in guest is never
// moved automatically. Decided here without writing anything, so the worker (suggest.ts) and the
// what-if preview (simulation/what-if.ts) show the same outcome. Reads only; runs as the
// coordinator or vip_system.
import type { Tx } from '@/lib/db/context'
import { type PlanLine, allocate } from '@/lib/domain/rooms/allocator'
import { BLOCKER_TEXT, type Occupant, type RoomBlocker, roomBlocker } from '@/lib/domain/rooms/rules'
import type { AllocGuest } from '@/lib/domain/rooms/score'
import { type CurrentStay, type RoomWorld, allocationInput, loadGuests, loadRoomWorld, pendingRoomHolds, withHolds } from './input'

export type PlacedLine = PlanLine & { readonly room: NonNullable<PlanLine['room']> }

interface Affected {
  readonly stay: CurrentStay
  readonly guest: AllocGuest
  readonly room_number: string
  readonly blocker: RoomBlocker
}

export type StayOutcome =
  | (Affected & { readonly kind: 'move'; readonly line: PlacedLine })
  | (Affected & { readonly kind: 'no_room' })
  | (Affected & { readonly kind: 'checked_in' })

/** Why stays must leave their room: the proposal's opening sentence and the alerts' titles. */
export interface MoveCause {
  readonly summary: (roomNumber: string, blocker: RoomBlocker) => string
  readonly no_room: (guestName: string, roomNumber: string) => string
  readonly checked_in: (guestName: string, roomNumber: string) => string
}

export const ARRIVAL_MOVED: MoveCause = {
  summary: (roomNumber) => `The arrival time changed and room ${roomNumber} no longer works for the new time.`,
  no_room: (guestName) => `No room for ${guestName} at the new arrival time`,
  checked_in: (guestName, roomNumber) => `${guestName} is checked in to room ${roomNumber}, which no longer works for the new time`,
}

export const ROOM_CHANGED: MoveCause = {
  summary: (roomNumber, blocker) => `Room ${roomNumber} can no longer be used for this stay. ${BLOCKER_TEXT[blocker]}`,
  no_room: (guestName, roomNumber) => `No room for ${guestName}: room ${roomNumber} can no longer be used`,
  checked_in: (guestName, roomNumber) => `${guestName} is checked in to room ${roomNumber}, which can no longer be used`,
}

export interface OutcomeText {
  readonly title: string
  readonly detail: string
}

/** The words a proposal or alert for this outcome uses (and the preview shows). */
export function outcomeText(outcome: StayOutcome, cause: MoveCause): OutcomeText {
  const { guest, room_number: roomNumber, blocker } = outcome
  switch (outcome.kind) {
    case 'move':
      return { title: `Move ${guest.name} from room ${roomNumber} to ${outcome.line.room.number}`, detail: `${cause.summary(roomNumber, blocker)} ${outcome.line.why}.` }
    case 'no_room':
      return { title: cause.no_room(guest.name, roomNumber), detail: BLOCKER_TEXT[blocker] }
    case 'checked_in':
      return { title: cause.checked_in(guest.name, roomNumber), detail: `${BLOCKER_TEXT[blocker]} ${BLOCKER_TEXT.checked_in}` }
  }
}

/** A room taken out of service in memory only, for a preview. */
export const withRoomOutOfService =
  (roomId: string) =>
  (world: RoomWorld): RoomWorld => ({ ...world, rooms: world.rooms.map((room) => (room.id === roomId ? { ...room, out_of_service: true } : room)) })

const holdFor = (line: PlacedLine): Occupant => ({ room_id: line.room.id, guest_id: line.guest.id, share_group: line.guest.share_group, check_in: line.guest.check_in, check_out: line.guest.check_out })

async function decide(tx: Tx, world: RoomWorld, holds: readonly Occupant[], stay: CurrentStay, now: Date): Promise<StayOutcome | null> {
  const room = world.rooms.find((item) => item.id === stay.room_id)
  const others = [...world.stays.filter((item) => item.guest_id !== stay.guest_id), ...holds]
  const blocker = room ? roomBlocker(room, { guest_ids: [stay.guest_id], share_group: stay.share_group, check_in: stay.check_in, check_out: stay.check_out }, others, now.getTime()) : null
  if (!room || !blocker) return null
  const [guest] = await loadGuests(tx, [stay.guest_id], true)
  if (!guest) return null
  const affected = { stay, guest, room_number: room.number, blocker }
  if (stay.status === 'checked_in') return { ...affected, kind: 'checked_in' }
  const elsewhere = { ...world, stays: world.stays.filter((item) => item.assignment_id !== stay.assignment_id) }
  const [line] = allocate(allocationInput(withHolds(elsewhere, holds), [guest], now)).lines
  return line?.room ? { ...affected, kind: 'move', line: line as PlacedLine } : { ...affected, kind: 'no_room' }
}

/**
 * The outcome for every affected stay its room can no longer take. Rooms already named by pending
 * suggestions, and by moves decided earlier in the same pass, are held, so two moves never collide.
 */
export async function planStayMoves(tx: Tx, affected: (stay: CurrentStay) => boolean, now: Date, adjust: (world: RoomWorld) => RoomWorld = (world) => world): Promise<StayOutcome[]> {
  const world = adjust(await loadRoomWorld(tx))
  let holds: Occupant[] = await pendingRoomHolds(tx)
  const outcomes: StayOutcome[] = []
  for (const stay of world.stays.filter(affected)) {
    const outcome = await decide(tx, world, holds, stay, now)
    if (!outcome) continue
    outcomes.push(outcome)
    if (outcome.kind === 'move') holds = [...holds, holdFor(outcome.line)]
  }
  return outcomes
}
