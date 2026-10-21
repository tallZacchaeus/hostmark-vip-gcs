// Guests and delegations (FR-IN-09/11, 03-App-Flow.md /guests and /guests/[id]). One row per
// delegation in the list (principal + party size); the profile gathers everything about one
// guest's party. Runs as the signed-in user; row-level security decides what is visible.
import { type RawBuilder, type SqlBool, sql } from 'kysely'
import { Errors } from '@/lib/api/errors'
import type { Tx } from '@/lib/db/context'
import type { Pagination } from '@/lib/validation/common'

export const GUEST_TABS = ['all', 'today', 'attention', 'arrived'] as const
export type GuestTab = (typeof GUEST_TABS)[number]

/** Best known arrival: manual override, then flight data, then what the guest told us. */
const ARRIVAL_AT = sql<string | null>`coalesce(f.manual_arrival_at, f.actual_arrival_at, f.estimated_arrival_at, f.scheduled_arrival_at, a.stated_arrival_at, a.requested_pickup_at)`
const OPEN_ISSUES = sql<number>`(
  select count(*)::int from public.guest_requirements r
  join public.guests rg on rg.id = r.guest_id
  where rg.delegation_id = d.id and r.needs_attention and r.resolved_at is null
)`
const COMPANIONS = sql<number>`(
  select greatest(count(*)::int - 1, 0) from public.guests m where m.delegation_id = d.id and m.status <> 'cancelled'
)`

/** The party's rooms: the principal's first (row-level security hides them from roles without room access). */
const PARTY_STAYS = sql`from public.room_assignments ra join public.guests m on m.id = ra.guest_id where m.delegation_id = d.id`
const ROOMS = sql`
  (select r.number from public.room_assignments ra join public.guests m on m.id = ra.guest_id join public.rooms r on r.id = ra.room_id
    where m.delegation_id = d.id and ra.status in ('planned', 'checked_in')
    order by m.id = d.principal_guest_id desc, r.number limit 1) as room_number,
  (select count(*)::int ${PARTY_STAYS} and ra.status in ('planned', 'checked_in')) as rooms_placed,
  exists (select 1 ${PARTY_STAYS} and ra.status = 'checked_in') as room_checked_in,
  exists (
    select 1 from public.proposals pr join public.guests m on m.id = pr.target_id
    where m.delegation_id = d.id and pr.kind = 'room_assignment' and pr.status = 'pending'
  ) as room_suggested`

const FROM_DELEGATIONS = sql`
  from public.delegations d
  join public.guests g on g.id = d.principal_guest_id
  left join public.vip_categories vc on vc.id = g.vip_category_id
  left join lateral (
    select a0.* from public.arrivals a0
    where a0.delegation_id = d.id and a0.status <> 'cancelled'
    order by a0.created_at limit 1
  ) a on true
  left join public.flights f on f.id = a.flight_id
  left join lateral (
    select p0.id, p0.status, p0.pickup_at from public.pickups p0
    where p0.arrival_id = a.id and p0.status <> 'cancelled' limit 1
  ) p on true
  left join public.intake_submissions s on s.id = d.created_from_submission_id`

export interface GuestFilters {
  readonly tab: GuestTab
  readonly search?: string
  readonly category_id?: string
}

function arrivalDay(timeZone: string): RawBuilder<string> {
  return sql<string>`coalesce(f.arrival_date_local, (${ARRIVAL_AT} at time zone ${timeZone})::date)`
}

function conditions(filters: Omit<GuestFilters, 'tab'>, tab: GuestTab, timeZone: string, today: string): RawBuilder<SqlBool> {
  const parts: RawBuilder<SqlBool>[] = [sql<SqlBool>`true`]
  if (filters.search) {
    const pattern = `%${filters.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
    parts.push(sql<SqlBool>`(d.name ilike ${pattern} or g.full_name ilike ${pattern} or f.flight_number ilike ${pattern} or s.reference_code ilike ${pattern})`)
  }
  if (filters.category_id) parts.push(sql<SqlBool>`g.vip_category_id = ${filters.category_id}::uuid`)
  if (tab === 'today') parts.push(sql<SqlBool>`${arrivalDay(timeZone)} = ${today}::date`)
  if (tab === 'attention') parts.push(sql<SqlBool>`${OPEN_ISSUES} > 0`)
  if (tab === 'arrived') parts.push(sql<SqlBool>`(d.status = 'arrived' or a.status = 'arrived' or g.status in ('arrived', 'checked_in'))`)
  return sql.join(parts, sql` and `) as RawBuilder<SqlBool>
}

export interface DelegationRow {
  readonly delegation_id: string
  readonly delegation_name: string
  readonly delegation_status: string
  readonly principal_guest_id: string
  readonly title: string | null
  readonly full_name: string
  readonly category_id: string | null
  readonly category_name: string | null
  readonly companions: number
  readonly arrival_mode: 'flying' | 'own_transport' | 'pickup' | null
  readonly arrival_at: string | null
  readonly arrival_status: string | null
  readonly flight_number: string | null
  readonly flight_phase: string | null
  readonly pickup_address: string | null
  readonly pickup_status: string | null
  readonly pickup_at: string | null
  readonly open_issues: number
  readonly reference_code: string | null
  readonly room_number: string | null
  readonly rooms_placed: number
  readonly room_checked_in: boolean
  readonly room_suggested: boolean
}

const ROW_COLUMNS = sql`
  d.id as delegation_id, d.name as delegation_name, d.status as delegation_status,
  g.id as principal_guest_id, g.title, g.full_name, vc.id as category_id, vc.name as category_name,
  ${COMPANIONS} as companions, a.mode as arrival_mode, ${ARRIVAL_AT} as arrival_at, a.status as arrival_status,
  f.flight_number, f.phase as flight_phase, a.pickup_address, p.status as pickup_status, p.pickup_at,
  ${OPEN_ISSUES} as open_issues, s.reference_code, ${ROOMS}`

export async function listDelegations(tx: Tx, filters: GuestFilters, pagination: Pagination, timeZone: string, today: string) {
  const where = conditions(filters, filters.tab, timeZone, today)
  const { rows } = await sql<DelegationRow>`
    select ${ROW_COLUMNS} ${FROM_DELEGATIONS}
    where ${where}
    order by ${ARRIVAL_AT} asc nulls last, g.full_name
    limit ${pagination.limit} offset ${(pagination.page - 1) * pagination.limit}`.execute(tx)
  const counts = await Promise.all(
    GUEST_TABS.map(async (tab) => {
      const { rows: [row] } = await sql<{ n: number }>`select count(*)::int as n ${FROM_DELEGATIONS} where ${conditions(filters, tab, timeZone, today)}`.execute(tx)
      return [tab, row?.n ?? 0] as const
    }),
  )
  const tabs = Object.fromEntries(counts) as Record<GuestTab, number>
  const { rows: [totals] } = await sql<{ delegations: number; guests: number }>`
    select (select count(*)::int from public.delegations) as delegations,
      (select count(*)::int from public.guests where status <> 'cancelled') as guests`.execute(tx)
  return { rows, total: tabs[filters.tab], tabs, totals: totals ?? { delegations: 0, guests: 0 } }
}

/** One delegation as compared side by side with a new submission (FR-IN-08, F3). */
export async function readDelegationSummary(tx: Tx, delegationId: string) {
  const { rows: [row] } = await sql<DelegationRow & { contact_name: string | null; contact_email: string | null; contact_phone: string | null; dietary: string[] }>`
    select ${ROW_COLUMNS}, d.contact_name, d.contact_email, d.contact_phone, g.dietary
    ${FROM_DELEGATIONS}
    where d.id = ${delegationId}::uuid`.execute(tx)
  return row ?? null
}

const HISTORY_LIMIT = 30

async function resolveGuestId(tx: Tx, id: string): Promise<string> {
  const guest = await tx.selectFrom('guests').select('id').where('id', '=', id).executeTakeFirst()
  if (guest) return guest.id
  // Notifications and audit entries about a delegation link to its principal's profile.
  const delegation = await tx.selectFrom('delegations').select('principal_guest_id').where('id', '=', id).executeTakeFirst()
  if (delegation?.principal_guest_id) return delegation.principal_guest_id
  throw Errors.notFound('Guest')
}

export async function getGuestProfile(tx: Tx, id: string) {
  const guestId = await resolveGuestId(tx, id)
  const guest = await tx
    .selectFrom('guests as g')
    .leftJoin('vip_categories as vc', 'vc.id', 'g.vip_category_id')
    .selectAll('g')
    .select(['vc.name as category_name'])
    .where('g.id', '=', guestId)
    .executeTakeFirstOrThrow()
  const delegation = await tx.selectFrom('delegations').selectAll().where('id', '=', guest.delegation_id).executeTakeFirstOrThrow()
  const members = await tx
    .selectFrom('guests as g')
    .leftJoin('vip_categories as vc', 'vc.id', 'g.vip_category_id')
    .select(['g.id', 'g.title', 'g.full_name', 'g.member_role', 'g.is_placeholder', 'g.status', 'g.dietary', 'g.accessibility', 'g.vip_category_id', 'vc.name as category_name', 'g.version'])
    .where('g.delegation_id', '=', delegation.id)
    .orderBy(sql`g.member_role = 'principal'`, 'desc')
    .orderBy('g.created_at')
    .execute()
  const arrival = guest.arrival_id
    ? await tx.selectFrom('arrivals').selectAll().where('id', '=', guest.arrival_id).executeTakeFirst()
    : await tx.selectFrom('arrivals').selectAll().where('delegation_id', '=', delegation.id).orderBy('created_at').executeTakeFirst()
  const flight = arrival?.flight_id ? await tx.selectFrom('flights').selectAll().where('id', '=', arrival.flight_id).executeTakeFirst() : undefined
  const pickup = arrival
    ? await tx.selectFrom('pickups').selectAll().where('arrival_id', '=', arrival.id).where('status', '<>', 'cancelled').executeTakeFirst()
    : undefined
  const requirements = await tx
    .selectFrom('guest_requirements as r')
    .innerJoin('guests as rg', 'rg.id', 'r.guest_id')
    .leftJoin('intake_submissions as s', 's.id', 'r.source_submission_id')
    .select(['r.id', 'r.guest_id', 'r.category', 'r.detail', 'r.source', 'r.needs_attention', 'r.conflicts_with', 'r.resolved_at', 'r.created_at', 's.source as submission_source', 's.reference_code'])
    .where('rg.delegation_id', '=', delegation.id)
    .orderBy(sql`r.resolved_at is not null`)
    .orderBy('r.created_at')
    .execute()
  const submissions = await tx
    .selectFrom('intake_submissions')
    .select(['id', 'reference_code', 'source', 'status', 'submitted_at'])
    .where((eb) => eb.or([eb('delegation_id', '=', delegation.id), eb('matched_delegation_id', '=', delegation.id)]))
    .orderBy('submitted_at', 'desc')
    .execute()
  const { stays, roomSuggestions } = await readRooms(tx, members.map((member) => member.id))
  const entityIds = [delegation.id, ...members.map((member) => member.id), arrival?.id, pickup?.id].filter((value): value is string => Boolean(value))
  const history = await readHistory(tx, entityIds)
  return { guest, delegation, members, arrival: arrival ?? null, flight: flight ?? null, pickup: pickup ?? null, requirements, submissions, history, stays, room_suggestions: roomSuggestions }
}

/** The party's current stays and pending room suggestions (hidden by RLS from roles without room access). */
async function readRooms(tx: Tx, memberIds: readonly string[]) {
  const stays = await tx
    .selectFrom('room_assignments as a')
    .innerJoin('rooms as r', 'r.id', 'a.room_id')
    .innerJoin('room_types as rt', 'rt.id', 'r.room_type_id')
    .select(['a.id', 'a.guest_id', 'a.status', 'a.expected_check_in_at', 'a.expected_check_out_at', 'a.is_manual_override', 'r.id as room_id', 'r.number', 'r.floor', 'r.wing', 'rt.name as room_type'])
    // The coordinator's reason for an override is theirs; the front desk sees only that one was made.
    .select(sql<string | null>`case when private.is_coordinator_plus() then a.override_reason end`.as('override_reason'))
    .where('a.guest_id', 'in', [...memberIds])
    .where('a.status', 'in', ['planned', 'checked_in'])
    .execute()
  const roomSuggestions = await tx
    .selectFrom('proposals as p')
    .leftJoin('proposals as parent', 'parent.id', 'p.parent_id')
    .select(['p.id', 'p.parent_id', 'p.target_id as guest_id', sql<string>`p.rationale -> 'room' ->> 'number'`.as('room_number')])
    .where('p.kind', '=', 'room_assignment')
    .where('p.status', '=', 'pending')
    .where('p.target_id', 'in', [...memberIds])
    .where((eb) => eb.or([eb('p.parent_id', 'is', null), eb('parent.status', '=', 'pending')]))
    .execute()
  return { stays, roomSuggestions }
}

async function readHistory(tx: Tx, entityIds: readonly string[]) {
  return tx
    .selectFrom('audit_log as l')
    .leftJoin('profiles as p', 'p.id', 'l.actor_id')
    .select([
      'l.id',
      'l.occurred_at',
      'l.actor_type',
      'l.actor_id',
      'p.full_name as actor_name',
      'l.action',
      'l.entity_type',
      'l.entity_id',
      'l.before',
      'l.after',
      'l.is_automatic',
      'l.undoable',
      'l.undo_of_audit_id',
    ])
    .select((eb) => eb.exists(eb.selectFrom('audit_log as u').select('u.id').whereRef('u.undo_of_audit_id', '=', 'l.id')).as('undone'))
    .where('l.entity_id', 'in', [...entityIds])
    .orderBy('l.id', 'desc')
    .limit(HISTORY_LIMIT)
    .execute()
}
