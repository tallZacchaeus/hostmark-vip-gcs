// Co-Pilot write tools (FR-CP-04): each only creates a proposal through public.copilot_propose,
// shown inline with Approve / Reject. Nothing changes until a coordinator approves, and the
// database executors re-check every rule at that moment.
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'
import type { ProposalKind } from '@/lib/db/types'
import { checkMove } from '@/lib/services/rooms/check'
import { type Citation, type ToolContext, guestCitation, time } from './text'

export interface ProposalCard {
  readonly id: string
  readonly title: string
  readonly summary: string | null
}

export interface WriteAnswer {
  readonly answer: string
  readonly citations: Citation[]
  readonly proposal: ProposalCard | null
}

interface NewProposal {
  readonly kind: ProposalKind
  readonly payload: Record<string, unknown>
  readonly title: string
  readonly summary: string | null
  readonly target_type: string
  readonly target_id: string
}

async function propose(tx: Tx, proposal: NewProposal): Promise<ProposalCard> {
  const { rows } = await sql<{ id: string }>`
    select public.copilot_propose(${proposal.kind}::public.proposal_kind, ${JSON.stringify(proposal.payload)}::jsonb, ${proposal.title}, ${proposal.summary},
      ${proposal.target_type}, ${proposal.target_id}::uuid) as id`.execute(tx)
  const id = rows[0]?.id
  if (!id) throw new Error('copilot_propose returned no id')
  return { id, title: proposal.title, summary: proposal.summary }
}

async function guestOf(tx: Tx, guestId: string): Promise<{ name: string; delegation_id: string; arrival_id: string | null } | undefined> {
  const { rows } = await sql<{ name: string; delegation_id: string; arrival_id: string | null }>`
    select concat_ws(' ', title, full_name) as name, delegation_id, arrival_id from public.guests where id = ${guestId}`.execute(tx)
  return rows[0]
}

const prepared = (card: ProposalCard): string => `I have prepared this for your approval: ${card.title}.${card.summary ? ` ${card.summary}` : ''} Nothing changes until you approve it.`

export async function proposeRoomMove(tx: Tx, args: { guest_id: string; room_number: string }, context: ToolContext): Promise<WriteAnswer> {
  const guest = await guestOf(tx, args.guest_id)
  const { rows } = await sql<{ id: string }>`select id from public.rooms where number = ${args.room_number}`.execute(tx)
  const roomId = rows[0]?.id
  if (!guest || !roomId) return { answer: 'I could not find that guest or room.', citations: [], proposal: null }
  const check = await checkMove(tx, args.guest_id, roomId, context.now)
  if (check.from_room?.number === args.room_number) return { answer: `${guest.name} is already in room ${args.room_number}.`, citations: [guestCitation(guest.name, guest.delegation_id)], proposal: null }
  const { rows: stays } = await sql<{ id: string; status: string }>`
    select id, status from public.room_assignments where guest_id = ${args.guest_id} and status in ('planned', 'checked_in')`.execute(tx)
  const stay = stays[0]
  if (stay?.status === 'checked_in') {
    return { answer: `${guest.name} is already checked in. A checked-in guest is moved from the Rooms screen, where the warning and a reason are required.`, citations: [guestCitation(guest.name, guest.delegation_id), { label: 'Rooms', href: '/rooms' }], proposal: null }
  }
  const warnings = check.violations.map((violation) => violation.text)
  const card = await propose(tx, {
    kind: 'room_assignment',
    payload: { guest_id: args.guest_id, room_id: roomId, ...(stay ? { replaces: stay.id } : {}) },
    title: `Move ${guest.name} to room ${args.room_number}`,
    summary: warnings.length ? `Warning: ${warnings.join(' ')} It will be refused at approval unless that changes.` : check.from_room ? `From room ${check.from_room.number}.` : null,
    target_type: 'guests',
    target_id: args.guest_id,
  })
  return { answer: prepared(card), citations: [guestCitation(guest.name, guest.delegation_id), { label: `Room ${args.room_number}`, href: '/rooms' }], proposal: card }
}

export async function proposeDriverAssignment(tx: Tx, args: { guest_id: string; driver_id: string }, context: ToolContext): Promise<WriteAnswer> {
  const guest = await guestOf(tx, args.guest_id)
  if (!guest) return { answer: 'I could not find that guest.', citations: [], proposal: null }
  const { rows } = await sql<{ pickup_id: string; pickup_at: Date; driver: string; assigned: boolean }>`
    select p.id as pickup_id, p.pickup_at, (select full_name from public.drivers where id = ${args.driver_id}) as driver,
      exists (select 1 from public.pickup_assignments pa where pa.pickup_id = p.id and pa.status = 'active') as assigned
    from public.pickups p
    where p.arrival_id = ${guest.arrival_id} and p.status not in ('cancelled', 'completed', 'en_route', 'picked_up')
    order by p.pickup_at limit 1`.execute(tx)
  const pickup = rows[0]
  const citation = guestCitation(guest.name, guest.delegation_id)
  if (!pickup) return { answer: `${guest.name} has no pickup waiting for a driver.`, citations: [citation], proposal: null }
  const card = await propose(tx, {
    kind: pickup.assigned ? 'driver_reassignment' : 'driver_assignment',
    payload: { pickup_id: pickup.pickup_id, driver_ids: [args.driver_id] },
    title: `${pickup.assigned ? 'Reassign' : 'Assign'} ${pickup.driver} to ${guest.name}'s pickup at ${time(pickup.pickup_at, context)}`,
    summary: 'The driver’s shift, other trips and seats are checked again when you approve.',
    target_type: 'pickups',
    target_id: pickup.pickup_id,
  })
  return { answer: prepared(card), citations: [citation, { label: 'Transport', href: '/transport' }], proposal: card }
}

export async function proposeNote(tx: Tx, args: { guest_id: string; text: string }): Promise<WriteAnswer> {
  const guest = await guestOf(tx, args.guest_id)
  if (!guest) return { answer: 'I could not find that guest.', citations: [], proposal: null }
  const detail = args.text.trim().slice(0, 1000)
  const card = await propose(tx, {
    kind: 'copilot_action',
    payload: { action: 'add_note', guest_id: args.guest_id, detail },
    title: `Add a note to ${guest.name}`,
    summary: `“${detail}”`,
    target_type: 'guests',
    target_id: args.guest_id,
  })
  return { answer: prepared(card), citations: [guestCitation(guest.name, guest.delegation_id)], proposal: card }
}
