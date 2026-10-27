// Co-Pilot read tools over the operational boards (FR-CP-02): pickups, rooms, the cleaning queue,
// the programme and pending decisions. They reuse the screens' own repositories, so the Co-Pilot
// and the screens always agree, and run as the signed-in user (RLS).
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'
import { addDays, zonedDateKey, zonedDayStart } from '@/lib/domain/time'
import { loadCleaning } from '@/lib/repositories/cleaning'
import { loadProgramme } from '@/lib/repositories/programme'
import { loadRoomsBoard } from '@/lib/repositories/rooms-board'
import { type ToolAnswer, type ToolContext, listOf, plural, time } from './text'

export async function listPickups(tx: Tx, args: { filter: 'all' | 'unassigned' }, context: ToolContext): Promise<ToolAnswer> {
  const day = zonedDateKey(context.now, context.timezone)
  const { rows } = await sql<{ label: string; pickup_at: Date; drivers: string | null }>`
    select coalesce(nullif(concat_ws(' ', pg.title, pg.full_name), ''), d.name) as label, p.pickup_at,
      (select string_agg(dr.full_name, ', ') from public.pickup_assignments pa join public.drivers dr on dr.id = pa.driver_id
        where pa.pickup_id = p.id and pa.status = 'active') as drivers
    from public.pickups p
    join public.arrivals a on a.id = p.arrival_id
    join public.delegations d on d.id = a.delegation_id
    left join public.guests pg on pg.id = d.principal_guest_id
    where p.status not in ('cancelled', 'completed')
      and p.pickup_at >= ${zonedDayStart(day, context.timezone)}::timestamptz and p.pickup_at < ${zonedDayStart(addDays(day, 1), context.timezone)}::timestamptz
    order by p.pickup_at`.execute(tx)
  const chosen = args.filter === 'unassigned' ? rows.filter((row) => !row.drivers) : rows
  const subject = args.filter === 'unassigned' ? 'pickups today without a driver' : 'pickups today'
  if (chosen.length === 0) return { answer: `No ${subject}.`, citations: [{ label: 'Transport', href: '/transport' }] }
  const items = chosen.map((row) => `${row.label} at ${time(row.pickup_at, context)}${row.drivers ? ` (${row.drivers})` : args.filter === 'all' ? ' (no driver)' : ''}`)
  return { answer: `${plural(chosen.length, args.filter === 'unassigned' ? 'pickup' : 'pickup')} ${args.filter === 'unassigned' ? 'still need a driver' : 'today'}: ${listOf(items)}.`, citations: [{ label: 'Transport', href: '/transport' }] }
}

const STATUS_WORDS: Readonly<Record<string, string>> = {
  ready: 'ready',
  proposed: 'suggested',
  reserved: 'reserved',
  occupied: 'occupied',
  'needs-cleaning': 'waiting for cleaning',
  cleaning: 'being cleaned',
  'out-of-service': 'out of service',
}

export async function listRooms(tx: Tx, args: { filter: 'free' | 'all' }): Promise<ToolAnswer> {
  const board = await loadRoomsBoard(tx)
  const free = board.rooms.filter((room) => room.status === 'ready').map((room) => room.number)
  const counts = Object.entries(board.counts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${STATUS_WORDS[status] ?? status}`)
  const answer =
    args.filter === 'free'
      ? `${plural(free.length, 'room is', 'rooms are')} free and ready: ${free.length ? listOf(free) : 'none'}.`
      : `${plural(board.rooms.length, 'room')}: ${listOf(counts)}.${board.unplaced ? ` ${plural(board.unplaced, 'guest needs', 'guests need')} a room.` : ''}`
  return { answer, citations: [{ label: 'Rooms', href: '/rooms' }] }
}

export async function getCleaningQueue(tx: Tx, context: ToolContext): Promise<ToolAnswer> {
  const view = await loadCleaning(tx, context.now)
  if (view.queue.length === 0) return { answer: `No rooms are waiting to be cleaned. ${plural(view.summary.done_today, 'room')} cleaned today.`, citations: [{ label: 'Sanitation', href: '/sanitation' }] }
  const items = view.queue.map((item) => `${item.room_number} (${item.status === 'in_progress' ? 'being cleaned' : 'waiting'}, ready by ${time(item.ready_by, context)}${item.late_by_min > 0 ? `, ${item.late_by_min} min after it is needed` : ''})`)
  return {
    answer: `${plural(view.queue.length, 'room')} to turn around, in priority order: ${listOf(items)}. ${plural(view.summary.done_today, 'room')} cleaned today.`,
    citations: [{ label: 'Sanitation', href: '/sanitation' }],
  }
}

export async function getProgram(tx: Tx, args: { day: 'today' | 'tomorrow'; filter: 'all' | 'at_risk' }, context: ToolContext): Promise<ToolAnswer> {
  const today = zonedDateKey(context.now, context.timezone)
  const view = await loadProgramme(tx, args.day === 'tomorrow' ? addDays(today, 1) : today, context.now, false)
  const items = args.filter === 'at_risk' ? view.items.filter((item) => item.state === 'risk') : view.items.filter((item) => item.status !== 'cancelled')
  const citations = [{ label: 'Programme', href: '/programme' }]
  if (items.length === 0) return { answer: args.filter === 'at_risk' ? `No programme item is at risk ${args.day}.` : `Nothing is on the programme ${args.day}.`, citations }
  const described = items.map((item) => {
    const late = item.participants.filter((participant) => participant.late).map((participant) => `${participant.name} expected ${time(participant.expected_at, context)}`)
    return `${item.title} at ${time(item.starts_at, context)} in ${item.location}${late.length ? ` (at risk: ${late.join('; ')})` : ''}`
  })
  return { answer: `${args.filter === 'at_risk' ? `${plural(items.length, 'item is', 'items are')} at risk ${args.day}` : `On the programme ${args.day}`}: ${listOf(described)}.`, citations }
}

export async function getPendingDecisions(tx: Tx): Promise<ToolAnswer> {
  const { rows } = await sql<{ title: string }>`
    select title from public.proposals where status = 'pending' and parent_id is null order by created_at desc limit 20`.execute(tx)
  const citations = [{ label: 'Decisions', href: '/dashboard#approvals' }]
  if (rows.length === 0) return { answer: 'Nothing is waiting for your approval.', citations }
  return { answer: `${plural(rows.length, 'decision is', 'decisions are')} waiting for you: ${listOf(rows.map((row) => row.title))}.`, citations }
}
