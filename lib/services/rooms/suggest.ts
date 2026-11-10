// Room proposals outside a full plan run. FR-RA-05: once rooms are being allocated, a guest added
// later gets a room proposal of their own (the worker checks every minute). FR-RA-07: when an
// arrival moves, its guests' planned stays follow; a stay whose room no longer works at the new
// time gets a proposal to move (or the coordinators an alert), and so does a stay whose room changes
// (taken out of service, reworkRoom); moves.ts decides which. A pending suggestion holds its room,
// so two suggestions never name the same room for overlapping stays. vip_system only.
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'
import { allocate } from '@/lib/domain/rooms/allocator'
import { notifyCoordinators } from '@/lib/services/notify'
import { type Trigger, createProposal } from '@/lib/services/proposals'
import { allocationInput, loadRoomWorld, pendingRoomHolds, withHolds } from './input'
import { ARRIVAL_MOVED, type MoveCause, type PlacedLine, ROOM_CHANGED, type StayOutcome, outcomeText, planStayMoves } from './moves'
import { roomLine } from './plan'

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
  return applyOutcomes(tx, await planStayMoves(tx, (stay) => movedIds.has(stay.assignment_id), now), ARRIVAL_MOVED, trigger)
}

/**
 * Re-checks the stays in a room that changed (e.g. taken out of service, FR-RA-01): each stay the
 * room can no longer take gets a proposal to move, or the coordinators an alert — always an alert
 * for a checked-in guest, whom only a person moves.
 */
export async function reworkRoom(tx: Tx, roomId: string, now: Date, trigger: Trigger | null): Promise<number> {
  return applyOutcomes(tx, await planStayMoves(tx, (stay) => stay.room_id === roomId, now), ROOM_CHANGED, trigger)
}

/** Proposals for the moves, high-priority alerts for the rest; returns how many proposals. */
async function applyOutcomes(tx: Tx, outcomes: readonly StayOutcome[], cause: MoveCause, trigger: Trigger | null): Promise<number> {
  for (const outcome of outcomes) {
    const text = outcomeText(outcome, cause)
    if (outcome.kind !== 'move') {
      await notifyCoordinators(tx, { kind: 'room_alert', title: text.title, body: text.detail, priority: 'high', entity_type: 'guests', entity_id: outcome.guest.id })
      continue
    }
    await createProposal(tx, {
      kind: 'room_assignment',
      title: text.title,
      summary: text.detail,
      ...roomLine(outcome.line, outcome.stay.assignment_id),
      target_type: 'guests',
      target_id: outcome.guest.id,
      trigger,
    })
  }
  return outcomes.filter((outcome) => outcome.kind === 'move').length
}
