// Turns an assessed intake into records (FR-IN-09): delegation, principal guest, named or
// placeholder members, the arrival, a tracked flight (shared by everyone on it) and a pickup.
// Runs in the caller's transaction: as vip_system when processed automatically, or as the
// coordinator (row-level security applies) on approval or manual entry. Every row is audited.
import { type InsertObject, type Selectable, sql } from 'kysely'
import { ApiError } from '@/lib/api/errors'
import type { Tx } from '@/lib/db/context'
import type { DB, Events, Json } from '@/lib/db/types'
import { type DuplicateCandidate, type DuplicateResult, classifyDuplicate, newReferenceCode } from '@/lib/domain/intake/duplicates'
import type { Extraction } from '@/lib/domain/intake/extraction'
import { type NormalizedIntake, displayName, normalizeIntake } from '@/lib/domain/intake/normalize'
import type { IntakeFields } from '@/lib/domain/intake/schema'
import { type IntakeIssue, isHighConfidence, validateIntake } from '@/lib/domain/intake/validate'
import { addMinutes, zonedDateTime } from '@/lib/domain/time'
import { CURRENT_EVENT_ID } from '@/lib/db/current-event'

const EVENT_COLUMNS = [
  'id',
  'status',
  'name',
  'venue_name',
  'timezone',
  'starts_on',
  'ends_on',
  'intake_window_days',
  'intake_open',
  'auto_process_enabled',
  'arrival_airports',
  'airport_exit_buffer_min',
  'airport_travel_min',
  'local_travel_min',
] as const

export type IntakeEvent = Pick<Selectable<Events>, (typeof EVENT_COLUMNS)[number]>

/** Candidates below this trigram similarity are not even considered (classification uses 0.6). */
const CANDIDATE_SIMILARITY = 0.3
const MAX_CANDIDATES = 10
/** `departure_date` has no time; guests are expected to leave at midday (check-out planning, P4). */
const NOMINAL_DEPARTURE_TIME = '12:00'
const MAX_REFERENCE_ATTEMPTS = 8

/** jsonb parameter: pg would turn a JS array into a Postgres array literal, so serialise here. */
export const jsonb = (value: unknown) => sql<Json>`${JSON.stringify(value)}::jsonb`

export async function loadEvent(tx: Tx, intakeToken?: string): Promise<IntakeEvent | undefined> {
  // By registration link, or else the current event (P9).
  let query = tx.selectFrom('events').select(EVENT_COLUMNS)
  query = intakeToken !== undefined ? query.where('intake_token', '=', intakeToken) : query.where('id', '=', CURRENT_EVENT_ID)
  return query.limit(1).executeTakeFirst()
}

export async function requireEvent(tx: Tx): Promise<IntakeEvent> {
  const event = await loadEvent(tx)
  if (!event) throw new ApiError(409, 'event_not_found', 'Set up the event first')
  return event
}

export async function findDuplicateCandidates(tx: Tx, intake: NormalizedIntake, timeZone: string): Promise<DuplicateCandidate[]> {
  const { rows } = await sql<DuplicateCandidate>`
    select d.id as delegation_id,
      g.full_name as principal_name,
      public.similarity(g.full_name, ${intake.full_name})::float8 as similarity,
      f.flight_number,
      coalesce(
        f.arrival_date_local,
        (coalesce(a.stated_arrival_at, a.requested_pickup_at) at time zone ${timeZone})::date
      )::text as arrival_date,
      d.contact_email,
      d.contact_phone,
      (select greatest(count(*)::int - 1, 0) from public.guests m where m.delegation_id = d.id) as party_size,
      (g.expected_departure_at at time zone ${timeZone})::date::text as departure_date
    from public.delegations d
    join public.guests g on g.id = d.principal_guest_id
    left join public.arrivals a on a.delegation_id = d.id and a.status <> 'cancelled'
    left join public.flights f on f.id = a.flight_id
    where d.status <> 'cancelled'
      and (
        public.similarity(g.full_name, ${intake.full_name}) >= ${CANDIDATE_SIMILARITY}
        or d.contact_email = ${intake.contact_email}
        or d.contact_phone = ${intake.contact_phone}
      )
    order by 3 desc
    limit ${MAX_CANDIDATES}`.execute(tx)
  return rows
}

export interface Assessment {
  readonly intake: NormalizedIntake
  readonly issues: IntakeIssue[]
  readonly duplicate: DuplicateResult
  readonly high_confidence: boolean
}

/** Normalise, check and look for duplicates (FR-IN-06…08). Writes nothing. */
export async function assessIntake(tx: Tx, fields: IntakeFields, extraction: Extraction, event: IntakeEvent): Promise<Assessment> {
  const intake = normalizeIntake(fields, event.timezone)
  const issues = validateIntake(fields, intake, event, extraction)
  const duplicate = classifyDuplicate(intake, await findDuplicateCandidates(tx, intake, event.timezone))
  return { intake, issues, duplicate, high_confidence: isHighConfidence(issues, duplicate.kind) }
}

type SubmissionValues = Omit<InsertObject<DB, 'intake_submissions'>, 'reference_code'>

const isReferenceClash = (error: unknown): boolean =>
  (error as { code?: unknown; constraint?: unknown } | null)?.code === '23505' &&
  String((error as { constraint?: unknown }).constraint ?? '').includes('reference_code')

/**
 * Inserts a submission under a fresh reference code. Two submissions can draw the same code at
 * once; the loser rolls back to a savepoint and draws again instead of failing the transaction.
 */
export async function insertSubmission(tx: Tx, values: SubmissionValues, generate: () => string = () => newReferenceCode()) {
  for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt += 1) {
    await sql`savepoint reference_code`.execute(tx)
    try {
      const row = await tx
        .insertInto('intake_submissions')
        .values({ ...values, reference_code: generate() })
        .returning(['id', 'reference_code'])
        .executeTakeFirstOrThrow()
      await sql`release savepoint reference_code`.execute(tx)
      return row
    } catch (error: unknown) {
      await sql`rollback to savepoint reference_code`.execute(tx)
      if (!isReferenceClash(error)) throw error
    }
  }
  throw new Error('Could not allocate a free reference code')
}

/** Submission columns describing how the free text was read (for the evaluation chapter). */
export function extractionColumns(extraction: Extraction) {
  return {
    extraction: jsonb({ items: extraction.items, method: extraction.method, error: extraction.error ?? null }),
    ai_model: extraction.model ?? (extraction.method === 'rules' ? 'rules' : null),
    ai_input_tokens: extraction.input_tokens ?? null,
    ai_output_tokens: extraction.output_tokens ?? null,
    ai_latency_ms: extraction.latency_ms ?? null,
  }
}

async function upsertFlight(tx: Tx, intake: NormalizedIntake, event: IntakeEvent): Promise<string> {
  const flightNumber = intake.flight_number
  const arrivalDate = intake.arrival_date
  if (!flightNumber || !arrivalDate) throw new ApiError(400, 'intake_incomplete', 'The flight number and arrival date are needed')
  const inserted = await tx
    .insertInto('flights')
    .values({
      flight_number: flightNumber,
      airline_iata: intake.airline_iata,
      arrival_date_local: arrivalDate,
      destination_iata: event.arrival_airports.length === 1 ? event.arrival_airports[0] : null,
      scheduled_arrival_at: intake.arrival_at,
    })
    .onConflict((conflict) => conflict.columns(['event_id', 'flight_number', 'arrival_date_local']).doNothing())
    .returning('id')
    .executeTakeFirst()
  if (inserted) return inserted.id
  const existing = await tx
    .selectFrom('flights')
    .select('id')
    .where('flight_number', '=', flightNumber)
    .where('arrival_date_local', '=', arrivalDate)
    .executeTakeFirstOrThrow()
  return existing.id
}

function arrivalTimes(intake: NormalizedIntake, event: IntakeEvent) {
  const at = intake.arrival_at
  switch (intake.arrival_mode) {
    case 'flying':
      return {
        stated_arrival_at: at,
        expected_at_venue_at: at ? addMinutes(at, event.airport_exit_buffer_min + event.airport_travel_min) : null,
      }
    case 'own_transport':
      return { stated_arrival_at: at, expected_at_venue_at: at }
    case 'pickup':
      return { requested_pickup_at: at, expected_at_venue_at: at ? addMinutes(at, event.local_travel_min) : null }
    default:
      return {}
  }
}

function airportPickupLocation(event: IntakeEvent): string {
  return event.arrival_airports.length > 0 ? `${event.arrival_airports.join(' / ')} airport, arrivals` : 'Airport arrivals'
}

/** A pickup for flying guests whose time is known and for pickup requests (FR-IN-09). */
function pickupFor(intake: NormalizedIntake, event: IntakeEvent, arrivalId: string) {
  const at = intake.arrival_at
  if (!at) return null
  const shared = { arrival_id: arrivalId, dropoff_location: event.venue_name, passenger_count: 1 + intake.party.length }
  if (intake.arrival_mode === 'pickup') {
    return { ...shared, kind: 'location' as const, pickup_location: intake.pickup_address, pickup_at: at }
  }
  if (intake.arrival_mode === 'flying') {
    const pickupAt = addMinutes(at, event.airport_exit_buffer_min)
    return { ...shared, kind: 'airport' as const, pickup_location: airportPickupLocation(event), pickup_at: pickupAt }
  }
  return null
}

export interface RecordOptions {
  readonly event: IntakeEvent
  readonly submission_id: string | null
  readonly vip_category_id?: string | null
}

export interface CreatedRecords {
  readonly delegation_id: string
  readonly principal_guest_id: string
  readonly arrival_id: string
  readonly pickup_id: string | null
}

interface SharedGuestColumns {
  readonly delegation_id: string
  readonly arrival_id: string
  readonly expected_departure_at: string | null
}

async function insertGuests(tx: Tx, intake: NormalizedIntake, principalId: string, shared: SharedGuestColumns, vipCategoryId: string | null) {
  await tx
    .insertInto('guests')
    .values([
      {
        ...shared,
        id: principalId,
        member_role: 'principal',
        full_name: intake.full_name,
        title: intake.title || null,
        organisation: intake.organisation || null,
        vip_category_id: vipCategoryId,
        dietary: intake.dietary,
        accessibility: intake.accessibility || null,
      },
      ...intake.party.map((member) => ({
        ...shared,
        member_role: member.role,
        title: member.title || null,
        full_name: member.name,
        is_placeholder: member.name === null,
        dietary: member.dietary,
        accessibility: member.accessibility || null,
      })),
    ])
    .execute()
}

async function insertRequirements(tx: Tx, extraction: Extraction, guestId: string, submissionId: string | null) {
  if (extraction.items.length === 0) return
  await tx
    .insertInto('guest_requirements')
    .values(
      extraction.items.map((item) => ({
        guest_id: guestId,
        category: item.category,
        detail: item.detail,
        source: 'extraction',
        source_submission_id: submissionId,
        needs_attention: item.needs_attention,
        conflicts_with: item.conflicts_with,
      })),
    )
    .execute()
}

export async function createDelegationRecords(
  tx: Tx,
  intake: NormalizedIntake,
  extraction: Extraction,
  { event, submission_id, vip_category_id = null }: RecordOptions,
): Promise<CreatedRecords> {
  if (!intake.full_name || !intake.arrival_mode) {
    throw new ApiError(400, 'intake_incomplete', 'The guest name and arrival details are needed')
  }
  const flightId = intake.arrival_mode === 'flying' ? await upsertFlight(tx, intake, event) : null
  const delegationId = crypto.randomUUID()
  const principalId = crypto.randomUUID()

  // The principal is inserted below; the foreign key is checked at commit (deferrable).
  await tx
    .insertInto('delegations')
    .values({
      id: delegationId,
      name: displayName(intake),
      principal_guest_id: principalId,
      created_from_submission_id: submission_id,
      contact_name: intake.contact_name || null,
      contact_email: intake.contact_email,
      contact_phone: intake.contact_phone,
    })
    .execute()

  const arrival = await tx
    .insertInto('arrivals')
    .values({
      delegation_id: delegationId,
      mode: intake.arrival_mode,
      flight_id: flightId,
      pickup_address: intake.arrival_mode === 'pickup' ? intake.pickup_address : null,
      ...arrivalTimes(intake, event),
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  const departure = intake.departure_date ? zonedDateTime(intake.departure_date, NOMINAL_DEPARTURE_TIME, event.timezone) : null
  await insertGuests(tx, intake, principalId, { delegation_id: delegationId, arrival_id: arrival.id, expected_departure_at: departure }, vip_category_id)
  await insertRequirements(tx, extraction, principalId, submission_id)

  const pickup = pickupFor(intake, event, arrival.id)
  const pickupRow = pickup ? await tx.insertInto('pickups').values(pickup).returning('id').executeTakeFirstOrThrow() : null

  return { delegation_id: delegationId, principal_guest_id: principalId, arrival_id: arrival.id, pickup_id: pickupRow?.id ?? null }
}

/** Kept here for the intake services; the shared implementation lives in lib/services/notify.ts. */
export { notifyCoordinators } from '../notify'
