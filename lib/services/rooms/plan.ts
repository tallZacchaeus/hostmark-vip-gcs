// "Run allocator" (FR-RA-04): plans rooms for every guest without one and stores the plan as a
// proposal with one line per guest — why, the preference match and the hard rules — for the
// coordinator to approve whole or in part. A newer plan supersedes an older pending one.
// vip_system (create_proposal), on behalf of the coordinator who asked.
import { sql } from 'kysely'
import { ApiError } from '@/lib/api/errors'
import type { Tx } from '@/lib/db/context'
import { type PlanLine, allocate } from '@/lib/domain/rooms/allocator'
import { createProposal } from '@/lib/services/proposals'
import { allocationInput, loadRoomWorld, pendingRoomHolds, withHolds } from './input'
import { CURRENT_EVENT_ID } from '@/lib/db/current-event'

export interface PlanSummary {
  readonly proposal_id: string
  readonly placed: number
  readonly unplaced: number
  readonly satisfaction: number
}

const iso = (time: number): string => new Date(time).toISOString()

/** What a room line carries: the payload the executor needs and what the review screen shows. */
export function roomLine(line: PlanLine & { readonly room: NonNullable<PlanLine['room']> }, replaces: string | null = null) {
  return {
    payload: { guest_id: line.guest.id, room_id: line.room.id, check_in: iso(line.guest.check_in), check_out: iso(line.guest.check_out), ...(replaces ? { replaces } : {}) },
    rationale: {
      why: line.why,
      match: line.match,
      score: line.score,
      meets_all: line.preferences.every((result) => result.status === 'met'),
      preferences: line.preferences.map(({ code, status, text }) => ({ code, status, text })),
      guest: { name: line.guest.name, role: line.guest.role_label, delegation: line.guest.delegation_name, is_principal: line.guest.is_principal },
      room: { number: line.room.number, type: line.room.type_name, wing: line.room.wing, floor: line.room.floor },
    },
  }
}

export async function runAllocation(tx: Tx, now: Date): Promise<PlanSummary> {
  // One run at a time: a second coordinator's run waits, then plans after this one.
  await sql`select pg_advisory_xact_lock(hashtext('rooms.plan'))`.execute(tx)
  // Guests with a pending room suggestion of their own keep it (and its room); an older pending
  // plan is superseded by this one, so its lines do not count.
  const holds = (await pendingRoomHolds(tx)).filter((hold) => hold.parent_id === null)
  const world = withHolds(await loadRoomWorld(tx), holds)
  const waiting = new Set(holds.map((hold) => hold.guest_id))
  const guests = world.unplaced.filter((guest) => !waiting.has(guest.id))
  if (guests.length === 0) throw new ApiError(409, 'nothing_to_plan', 'Every guest already has a room or a room suggestion')
  const event = await tx.selectFrom('events').select('id').where('id', '=', CURRENT_EVENT_ID).executeTakeFirstOrThrow()
  const plan = allocate(allocationInput(world, guests, now))
  const placed = plan.lines.filter((line): line is PlanLine & { room: NonNullable<PlanLine['room']> } => line.room !== null)
  const meetsAll = placed.filter((line) => line.preferences.every((result) => result.status === 'met')).length
  const percent = Math.round(plan.satisfaction * 100)

  const parentId = await createProposal(tx, {
    kind: 'room_plan',
    title: `Room plan for ${plan.lines.length} ${plan.lines.length === 1 ? 'guest' : 'guests'}`,
    summary: `${percent}% overall satisfaction · ${plan.placed} placed${plan.unplaced ? `, ${plan.unplaced} without a room` : ''}`,
    payload: { guest_count: plan.lines.length },
    rationale: {
      satisfaction: plan.satisfaction,
      placed: plan.placed,
      unplaced: plan.unplaced,
      meets_all: meetsAll,
      warnings: plan.placed - meetsAll,
      unplaced_guests: plan.lines.filter((line) => !line.room).map((line) => ({ guest_id: line.guest.id, name: line.guest.name, delegation: line.guest.delegation_name, reason: line.blocked })),
    },
    target_type: 'room_plans',
    target_id: event.id,
  })
  for (const line of placed) {
    await createProposal(tx, {
      kind: 'room_assignment',
      title: `${line.guest.name} → room ${line.room.number}`,
      summary: line.why,
      ...roomLine(line),
      target_type: 'guests',
      target_id: line.guest.id,
      parent_id: parentId,
    })
  }
  return { proposal_id: parentId, placed: plan.placed, unplaced: plan.unplaced, satisfaction: plan.satisfaction }
}
