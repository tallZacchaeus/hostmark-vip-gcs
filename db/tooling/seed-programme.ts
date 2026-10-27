// Programme demo data (P6) on top of the seeded guests and transport: the Figma day-one timeline
// (registration, lunch, reception, welcome briefing, opening dinner), day-two sessions and a draft
// for day three. The welcome briefing is timed just after the delayed ET512 party is expected at the
// venue, with Archbishop Tendai Moyo speaking, so the real triggers flag it at risk.
import { type Kysely, sql } from 'kysely'
import type { DB } from '@/lib/db/types'
import { addMinutes, zonedDateTime } from '@/lib/domain/time'

const TIMEZONE = 'Africa/Lagos'
const QUARTER_MS = 15 * 60_000
const BRIEFING_SPEAKER = 'Tendai Moyo'

interface SeedItem {
  readonly day: number
  readonly start: string
  readonly minutes: number
  readonly title: string
  readonly kind: 'session' | 'ceremony' | 'meal' | 'performance' | 'other'
  readonly location: string
  readonly status?: 'draft' | 'published'
  readonly participants?: readonly { readonly name: string; readonly role: 'speaker' | 'honoree' | 'performer' | 'attendee' }[]
}

const ITEMS: readonly SeedItem[] = [
  { day: 0, start: '09:00', minutes: 120, title: 'Registration and accreditation', kind: 'other', location: 'Main foyer' },
  { day: 0, start: '12:30', minutes: 90, title: 'Delegates’ lunch', kind: 'meal', location: 'Banquet hall' },
  { day: 0, start: '15:30', minutes: 60, title: 'Foyer reception', kind: 'ceremony', location: 'Garden terrace' },
  { day: 0, start: '19:30', minutes: 150, title: 'Opening dinner', kind: 'meal', location: 'Banquet hall', participants: [{ name: 'Augustine Okafor', role: 'honoree' }, { name: 'Funmilayo Alade', role: 'attendee' }] },
  { day: 1, start: '10:00', minutes: 90, title: 'Plenary: faith and public life', kind: 'session', location: 'Conference hall A', participants: [{ name: 'Funmilayo Alade', role: 'speaker' }, { name: 'Ngozi Eze', role: 'attendee' }] },
  { day: 1, start: '18:00', minutes: 60, title: 'Cultural performance', kind: 'performance', location: 'Garden terrace' },
  { day: 2, start: '11:00', minutes: 60, title: 'Closing ceremony rehearsal', kind: 'ceremony', location: 'Conference hall A', status: 'draft' },
]

export interface ProgrammeSeedResult {
  readonly items: number
  readonly briefingId: string
}

async function guestIdsByName(tx: Kysely<DB>): Promise<Map<string, string>> {
  const rows = await tx.selectFrom('guests').select(['id', 'full_name']).execute()
  return new Map(rows.flatMap((row) => (row.full_name ? [[row.full_name, row.id] as const] : [])))
}

async function insertItem(tx: Kysely<DB>, item: { title: string; kind: SeedItem['kind']; starts_at: string; ends_at: string; location: string; status: string }): Promise<string> {
  const { rows } = await sql<{ id: string }>`
    insert into public.program_items (title, kind, starts_at, ends_at, location, status)
    values (${item.title}, ${item.kind}::public.program_item_kind, ${item.starts_at}::timestamptz, ${item.ends_at}::timestamptz, ${item.location}, ${item.status}::public.program_item_status)
    returning id`.execute(tx)
  const id = rows[0]?.id
  if (!id) throw new Error(`Could not seed "${item.title}"`)
  return id
}

async function addParticipants(tx: Kysely<DB>, itemId: string, participants: SeedItem['participants'], guests: Map<string, string>): Promise<void> {
  for (const participant of participants ?? []) {
    const guestId = guests.get(participant.name)
    if (guestId) await tx.insertInto('program_participants').values({ program_item_id: itemId, guest_id: guestId, role: participant.role }).execute()
  }
}

/** The briefing starts one quarter hour after the speaker is expected (well inside the 30-minute lead time). */
async function briefingStart(tx: Kysely<DB>, guestId: string | undefined, fallback: string): Promise<string> {
  if (!guestId) return fallback
  const { rows } = await sql<{ expected: Date | null }>`
    select coalesce(a.expected_at_venue_at, a.stated_arrival_at) as expected
    from public.guests g join public.arrivals a on a.id = g.arrival_id where g.id = ${guestId}`.execute(tx)
  const expected = rows[0]?.expected
  return expected ? new Date(Math.ceil(new Date(expected).getTime() / QUARTER_MS) * QUARTER_MS + QUARTER_MS).toISOString() : fallback
}

export async function seedProgramme(db: Kysely<DB>, days: readonly string[]): Promise<ProgrammeSeedResult> {
  return db.transaction().execute(async (tx) => {
    await sql`select private.set_audit_context(p_actor_type => 'system', p_action => 'seed', p_undoable => false)`.execute(tx)
    const guests = await guestIdsByName(tx)
    for (const item of ITEMS) {
      const day = days[item.day] ?? days[0] ?? ''
      const startsAt = zonedDateTime(day, item.start, TIMEZONE)
      const id = await insertItem(tx, { title: item.title, kind: item.kind, starts_at: startsAt, ends_at: addMinutes(startsAt, item.minutes), location: item.location, status: item.status ?? 'published' })
      await addParticipants(tx, id, item.participants, guests)
    }
    const startsAt = await briefingStart(tx, guests.get(BRIEFING_SPEAKER), zonedDateTime(days[0] ?? '', '17:00', TIMEZONE))
    const briefingId = await insertItem(tx, { title: 'Welcome briefing', kind: 'session', starts_at: startsAt, ends_at: addMinutes(startsAt, 60), location: 'Conference hall A', status: 'published' })
    await addParticipants(tx, briefingId, [{ name: BRIEFING_SPEAKER, role: 'speaker' }], guests)
    return { items: ITEMS.length + 1, briefingId }
  })
}
