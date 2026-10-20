// One flight update — a live poll, a simulation step or a coordinator override — goes through
// here (FR-FT-04/10/11): the flight row changes, the change is recorded in flight_updates, and
// the cascade is planned and applied in the same vip_system transaction. The update row keeps
// how long the cascade took (PRD §8 M2 reassignment latency).
import { sql } from 'kysely'
import { ApiError } from '@/lib/api/errors'
import type { Tx } from '@/lib/db/context'
import { type FlightPhase, effectiveArrival, nextCheckAt } from '@/lib/domain/flights/schedule'
import { type CascadePlan, planCascade } from '@/lib/domain/transport/cascade'
import type { FlightSnapshot } from '@/lib/flights/provider'
import { jsonb } from '@/lib/services/intake/records'
import { applyCascadePlan, clearDisruption } from '@/lib/services/transport/apply'
import { loadFlightParties, loadTransportContext } from '@/lib/services/transport/context'

export type UpdateSource = 'live' | 'simulated' | 'manual'

export interface IngestInput {
  readonly flight_id: string
  readonly snapshot: FlightSnapshot
  readonly source: UpdateSource
  readonly observed_at: Date
  readonly simulation_run_id?: string | null
  readonly provider?: string | null
}

export interface IngestResult {
  readonly changed: boolean
  readonly flight_update_id: string | null
  readonly plan: CascadePlan | null
  readonly proposal_ids: string[]
}

const TIME_FIELDS = ['scheduled_arrival_at', 'estimated_arrival_at', 'actual_arrival_at', 'manual_arrival_at'] as const
const TEXT_FIELDS = ['phase', 'origin_iata', 'destination_iata'] as const
const TRACKED = [...TIME_FIELDS, ...TEXT_FIELDS] as const
type Tracked = Record<(typeof TRACKED)[number], string | null>

const isoOrNull = (value: Date | string | null | undefined): string | null => (value ? new Date(value).toISOString() : null)

function merge(stored: Tracked, snapshot: FlightSnapshot): Tracked {
  return {
    // "unknown" from a provider never overwrites what we already know.
    phase: snapshot.phase === 'unknown' ? stored.phase : snapshot.phase,
    scheduled_arrival_at: isoOrNull(snapshot.scheduled_arrival_at) ?? stored.scheduled_arrival_at,
    estimated_arrival_at: isoOrNull(snapshot.estimated_arrival_at),
    actual_arrival_at: isoOrNull(snapshot.actual_arrival_at),
    manual_arrival_at: snapshot.manual_arrival_at === undefined ? stored.manual_arrival_at : isoOrNull(snapshot.manual_arrival_at),
    origin_iata: snapshot.origin_iata ?? stored.origin_iata,
    destination_iata: snapshot.destination_iata ?? stored.destination_iata,
  }
}

function diff(before: Tracked, after: Tracked): Record<string, [string | null, string | null]> {
  return Object.fromEntries(TRACKED.filter((field) => before[field] !== after[field]).map((field) => [field, [before[field], after[field]]]))
}

async function cascade(tx: Tx, flightId: string, updateId: string): Promise<{ plan: CascadePlan; proposal_ids: string[] }> {
  const context = await loadTransportContext(tx)
  const parties = await loadFlightParties(tx, flightId)
  const plan = planCascade({ event: context.event, ...parties, drivers: context.drivers, shifts: context.shifts, trips: context.trips })
  if (parties.flight.phase !== 'cancelled' && parties.flight.phase !== 'diverted') await clearDisruption(tx, flightId)
  const proposalIds = await applyCascadePlan(tx, plan, context, { flight_id: flightId, trigger: { type: 'flight_update', id: updateId } })
  return { plan, proposal_ids: proposalIds }
}

async function recordUpdate(tx: Tx, flightId: string, input: IngestInput, changes: object): Promise<string> {
  const update = await tx
    .insertInto('flight_updates')
    .values({
      flight_id: flightId,
      observed_at: input.observed_at,
      source: input.source,
      changes: jsonb(changes),
      payload: input.snapshot.payload === undefined ? null : jsonb(input.snapshot.payload),
      simulation_run_id: input.simulation_run_id ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return String(update.id)
}

/**
 * A coordinator's own landing time (FR-FT-11): it beats every provider time until cleared (null).
 * Everything else about the flight stays as stored; the cascade runs as for any other change.
 */
export async function overrideArrival(tx: Tx, flightId: string, manualArrivalAt: string | null, now: Date): Promise<IngestResult> {
  const flight = await tx
    .selectFrom('flights')
    .select(['scheduled_arrival_at', 'estimated_arrival_at', 'actual_arrival_at', 'origin_iata', 'destination_iata'])
    .where('id', '=', flightId)
    .executeTakeFirst()
  if (!flight) throw new ApiError(404, 'not_found', 'Flight not found')
  const snapshot: FlightSnapshot = {
    phase: 'unknown',
    scheduled_arrival_at: isoOrNull(flight.scheduled_arrival_at),
    estimated_arrival_at: isoOrNull(flight.estimated_arrival_at),
    actual_arrival_at: isoOrNull(flight.actual_arrival_at),
    origin_iata: flight.origin_iata,
    destination_iata: flight.destination_iata,
    manual_arrival_at: manualArrivalAt,
  }
  return ingestFlightUpdate(tx, { flight_id: flightId, snapshot, source: 'manual', observed_at: now })
}

export async function ingestFlightUpdate(tx: Tx, input: IngestInput): Promise<IngestResult> {
  const row = await tx.selectFrom('flights').select(['id', 'provider', ...TRACKED]).where('id', '=', input.flight_id).forUpdate().executeTakeFirst()
  if (!row) throw new ApiError(404, 'not_found', 'Flight not found')
  const stored = {
    ...Object.fromEntries(TIME_FIELDS.map((field) => [field, isoOrNull(row[field])])),
    ...Object.fromEntries(TEXT_FIELDS.map((field) => [field, row[field]])),
  } as Tracked
  const next = merge(stored, input.snapshot)
  const changes = diff(stored, next)
  const phase = next.phase as FlightPhase

  await tx
    .updateTable('flights')
    .set({
      ...next,
      phase,
      last_checked_at: input.observed_at,
      next_check_at: nextCheckAt(input.observed_at, effectiveArrival(next), phase),
      provider: input.provider ?? row.provider,
      ...(input.snapshot.payload === undefined ? {} : { last_payload: jsonb(input.snapshot.payload) }),
    })
    .where('id', '=', row.id)
    .execute()
  if (Object.keys(changes).length === 0) return { changed: false, flight_update_id: null, plan: null, proposal_ids: [] }

  const updateId = await recordUpdate(tx, row.id, input, changes)
  const relevant = 'phase' in changes || TIME_FIELDS.some((field) => field in changes)
  const outcome = relevant ? await cascade(tx, row.id, updateId) : { plan: null, proposal_ids: [] }
  // Latency from ingestion (created_at = now(), the transaction start) to the cascade being done:
  // PRD §8 M2. observed_at is the provider's or scenario's time and may be far from ours.
  await sql`
    update public.flight_updates
    set cascade_completed_at = clock_timestamp(),
        cascade_ms = greatest(0, round(extract(epoch from clock_timestamp() - created_at) * 1000))::int
    where id = ${updateId}::bigint`.execute(tx)
  return { changed: true, flight_update_id: updateId, ...outcome }
}
