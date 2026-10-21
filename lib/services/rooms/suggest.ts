// Room proposals outside a full plan run. FR-RA-05: once rooms are being allocated, a guest added
// later gets a room proposal of their own (the worker checks every minute). FR-RA-07: when an
// arrival moves, its guests' planned stays follow; a stay whose room no longer works at the new
// time gets a proposal to move (or the coordinators an alert). A pending suggestion holds its room,
// so two suggestions never name the same room for overlapping stays. vip_system only.
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'
import { type PlanLine, allocate } from '@/lib/domain/rooms/allocator'
import { type Occupant, roomBlocker } from '@/lib/domain/rooms/rules'
import { notifyCoordinators } from '@/lib/services/notify'
import { type Trigger, createProposal } from '@/lib/services/proposals'
import { type RoomWorld, allocationInput, loadGuests, loadRoomWorld, loadStays, pendingRoomHolds, withHolds } from './input'
import { roomLine } from './plan'

type PlacedLine = PlanLine & { readonly room: NonNullable<PlanLine['room']> }

export async function suggestRoomsForNewGuests(tx: Tx, now: Date): Promise<number> {
  const started = await tx.selectFrom('room_assignments').select('id').limit(1).executeTakeFirst()
  if (!started) return 0
  const holds = await pendingRoomHolds(tx)
  const world = await loadRoomWorld(tx)
  const waiting = new Set(holds.map((hold) => hold.guest_id))
  const guests = world.unplaced.filter((guest) => !waiting.has(guest.id))
  if (guests.length === 0) return 0
  const plan = allocate(allocationInput(withHolds(world, holds), guests, now))
  const placed = plan.lines.filter((line): line is PlacedLine => line.room !== null)
  for (const line of placed) {
    await createProposal(tx, {
      kind: 'room_assignment',
      title: `Room ${line.room.number} for ${line.guest.name}`,
      summary: line.why,
      ...roomLine(line),
      target_type: 'guests',
      target_id: line.guest.id,
    })
  }
  return placed.length
}

/** Moves the planned stays of these arrivals' guests to their new times, and re-plans what no longer fits. */
export async function reworkStays(tx: Tx, arrivalIds: readonly string[], now: Date, trigger: Trigger | null): Promise<number> {
  if (arrivalIds.length === 0) return 0
  const moved = await sql<{ id: string }>`
    update public.room_assignments a
    set expected_check_in_at = lower(private.guest_stay_window(a.guest_id)),
        expected_check_out_at = upper(private.guest_stay_window(a.guest_id))
    from public.guests g
    where g.id = a.guest_id and a.status = 'planned' and g.arrival_id = any (${[...arrivalIds]}::uuid[])
      and a.expected_check_in_at is distinct from lower(private.guest_stay_window(a.guest_id))
    returning a.id`.execute(tx)
  if (moved.rows.length === 0) return 0
  const movedIds = new Set(moved.rows.map((row) => row.id))
  const holds = await pendingRoomHolds(tx)
  const world = await loadRoomWorld(tx)
  const stays = await loadStays(tx)
  let proposals = 0
  for (const stay of stays.filter((item) => movedIds.has(item.assignment_id))) {
    const room = world.rooms.find((item) => item.id === stay.room_id)
    const others = [...stays.filter((item) => item.guest_id !== stay.guest_id), ...holds]
    if (!room || !roomBlocker(room, { guest_ids: [stay.guest_id], share_group: stay.share_group, check_in: stay.check_in, check_out: stay.check_out }, others, now.getTime())) continue
    proposals += await proposeMove(tx, world, holds, stay, room.number, now, trigger)
  }
  return proposals
}

async function proposeMove(
  tx: Tx,
  world: RoomWorld,
  holds: readonly Occupant[],
  stay: RoomWorld['stays'][number],
  roomNumber: string,
  now: Date,
  trigger: Trigger | null,
): Promise<number> {
  const [details] = await loadGuests(tx, [stay.guest_id])
  if (!details) return 0
  const elsewhere = { ...world, stays: world.stays.filter((item) => item.assignment_id !== stay.assignment_id) }
  const [line] = allocate(allocationInput(withHolds(elsewhere, holds), [details], now)).lines
  if (!line?.room) {
    await notifyCoordinators(tx, { kind: 'room_alert', title: `No room for ${details.name} at the new arrival time`, priority: 'high', entity_type: 'guests', entity_id: details.id })
    return 0
  }
  await createProposal(tx, {
    kind: 'room_assignment',
    title: `Move ${details.name} from room ${roomNumber} to ${line.room.number}`,
    summary: `The arrival time changed and room ${roomNumber} no longer works for the new time. ${line.why}.`,
    ...roomLine(line as PlacedLine, stay.assignment_id),
    target_type: 'guests',
    target_id: details.id,
    trigger,
  })
  return 1
}
