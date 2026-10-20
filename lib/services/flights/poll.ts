// Adaptive flight polling (02-TRD.md §3.2): only flights whose next check is due and that someone
// is still expected on (not once everyone has arrived); one provider call per flight, outside any
// transaction; each answer goes through ingestFlightUpdate in its own vip_system transaction. A
// live provider's calls are counted per day (provider_usage_daily): coordinators are warned at 80%
// of the daily limit and polling pauses at 100% until the next day (TRD §9).
import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import { ApiError } from '@/lib/api/errors'
import { type SystemAudit, withSystem } from '@/lib/db/system'
import type { DB } from '@/lib/db/types'
import { type FlightPhase, effectiveArrival, nextCheckAt } from '@/lib/domain/flights/schedule'
import type { FlightProvider, TrackedFlight } from '@/lib/flights/provider'
import { logger } from '@/lib/logger'
import { notifyCoordinators } from '@/lib/services/notify'
import { type IngestResult, ingestFlightUpdate } from './ingest'

const DEFAULT_BATCH = 25
const RETRY_AFTER_MS = 10 * 60_000
const QUOTA_WARNING_SHARE = 0.8
/** "Check now" may use at most this share of the day's calls; the rest is kept for the worker. */
const MANUAL_SHARE = 0.8
const MANUAL_COOLDOWN_MS = 60_000
const FINAL_PHASES: readonly string[] = ['landed', 'cancelled', 'diverted']
const POLL_AUDIT: SystemAudit = { actor: 'system', action: 'flights.poll', undoable: false }

interface DueFlight extends TrackedFlight {
  readonly id: string
}

export interface PollOptions {
  readonly provider: FlightProvider
  readonly now: Date
  /** Live provider calls allowed per day (UTC). */
  readonly dailyLimit: number
  readonly batchSize?: number
  /** Renews the worker's lease; polling stops when it has been lost to another process. */
  readonly stillHolder?: () => Promise<boolean>
}

export interface PollReport {
  readonly checked: number
  readonly changed: number
  readonly failed: number
  readonly quota_reached: boolean
}

const FLIGHT_COLUMNS = [
  'id',
  'flight_number',
  'arrival_date_local',
  'phase',
  'scheduled_arrival_at',
  'estimated_arrival_at',
  'actual_arrival_at',
  'manual_arrival_at',
  'origin_iata',
  'destination_iata',
] as const

async function dueFlights(db: Kysely<DB>, now: Date, limit: number): Promise<DueFlight[]> {
  const rows = await withSystem(db, POLL_AUDIT, (tx) =>
    tx
      .selectFrom('flights as f')
      .select(FLIGHT_COLUMNS.map((column) => `f.${column}` as const))
      .where('f.phase', 'not in', ['landed', 'cancelled', 'diverted'])
      .where((eb) => eb.or([eb('f.next_check_at', 'is', null), eb('f.next_check_at', '<=', now)]))
      .where(({ exists, selectFrom }) =>
        exists(selectFrom('arrivals as a').select('a.id').whereRef('a.flight_id', '=', 'f.id').where('a.status', '=', 'expected')),
      )
      .orderBy(sql`f.next_check_at nulls first`)
      .limit(limit)
      .execute(),
  )
  return rows.map((row) => ({ ...row, phase: row.phase as FlightPhase }))
}

/**
 * Counts one live call; false when `cap` calls (default: the daily limit) are already used today.
 * The coordinators are warned once, when the count reaches 80% of the daily limit.
 */
async function takeQuota(db: Kysely<DB>, provider: string, now: Date, dailyLimit: number, cap = dailyLimit): Promise<boolean> {
  if (cap < 1) return false
  return withSystem(db, POLL_AUDIT, async (tx) => {
    const day = now.toISOString().slice(0, 10)
    const { rows } = await sql<{ calls: number }>`
      insert into public.provider_usage_daily as u (day, provider, calls) values (${day}::date, ${provider}, 1)
      on conflict (day, provider) do update set calls = u.calls + 1
      where u.calls < ${cap}
      returning calls`.execute(tx)
    const calls = rows[0]?.calls
    if (calls === undefined) return false
    if (calls === Math.ceil(dailyLimit * QUOTA_WARNING_SHARE)) {
      await notifyCoordinators(tx, {
        kind: 'provider_quota',
        title: `Flight data: ${calls} of ${dailyLimit} calls used today`,
        body: 'Flight checks pause for the day at the limit; times can still be set by hand.',
        priority: 'high',
      })
    }
    return true
  })
}

async function postpone(db: Kysely<DB>, flightId: string, now: Date, nextAt: Date | null): Promise<void> {
  await withSystem(db, POLL_AUDIT, (tx) => tx.updateTable('flights').set({ last_checked_at: now, next_check_at: nextAt }).where('id', '=', flightId).execute())
}

/** Asks the provider about one flight and ingests the answer. */
async function checkFlight(db: Kysely<DB>, flight: DueFlight, provider: FlightProvider, now: Date): Promise<IngestResult | null> {
  const snapshot = await provider.getStatus(flight, now)
  if (!snapshot) {
    await postpone(db, flight.id, now, nextCheckAt(now, effectiveArrival(flight), flight.phase))
    return null
  }
  return withSystem(db, POLL_AUDIT, (tx) =>
    ingestFlightUpdate(tx, {
      flight_id: flight.id,
      snapshot,
      source: provider.name === 'simulated' ? 'simulated' : 'live',
      observed_at: now,
      provider: provider.name,
    }),
  )
}

export async function pollDueFlights(db: Kysely<DB>, options: PollOptions): Promise<PollReport> {
  const { provider, now } = options
  const flights = await dueFlights(db, now, options.batchSize ?? DEFAULT_BATCH)
  let checked = 0
  let changed = 0
  let failed = 0
  for (const flight of flights) {
    if (options.stillHolder && !(await options.stillHolder())) break
    if (provider.name !== 'simulated' && !(await takeQuota(db, provider.name, now, options.dailyLimit))) {
      return { checked, changed, failed, quota_reached: true }
    }
    try {
      const result = await checkFlight(db, flight, provider, now)
      checked += 1
      if (result?.changed) changed += 1
    } catch (error) {
      failed += 1
      logger.warn('Flight check failed', { flight_id: flight.id, provider: provider.name, error })
      await postpone(db, flight.id, now, new Date(now.getTime() + RETRY_AFTER_MS))
    }
  }
  return { checked, changed, failed, quota_reached: false }
}

/** "Check now" for one flight (coordinator), whatever its schedule says. */
export async function refreshFlight(db: Kysely<DB>, flightId: string, options: PollOptions & { readonly userId: string }): Promise<IngestResult | null> {
  const flight = await withSystem(db, POLL_AUDIT, (tx) =>
    tx.selectFrom('flights').select([...FLIGHT_COLUMNS, 'last_checked_at']).where('id', '=', flightId).executeTakeFirst(),
  )
  if (!flight) throw new ApiError(404, 'not_found', 'Flight not found')
  if (FINAL_PHASES.includes(flight.phase)) {
    throw new ApiError(409, 'flight_final', 'This flight has already landed or will not arrive; set the time by hand if needed')
  }
  const live = options.provider.name !== 'simulated'
  if (live && flight.last_checked_at && options.now.getTime() - new Date(flight.last_checked_at).getTime() < MANUAL_COOLDOWN_MS) {
    throw new ApiError(429, 'checked_recently', 'This flight was checked less than a minute ago')
  }
  if (live && !(await takeQuota(db, options.provider.name, options.now, options.dailyLimit, Math.floor(options.dailyLimit * MANUAL_SHARE)))) {
    throw new ApiError(429, 'quota_reached', "Today's flight data limit for manual checks is used up; set the time by hand instead")
  }
  const tracked = { ...flight, phase: flight.phase as FlightPhase }
  const snapshot = await options.provider.getStatus(tracked, options.now)
  if (!snapshot) return null
  return withSystem(db, { actor: 'system', action: 'flights.refresh', onBehalfOf: options.userId, undoable: false }, (tx) =>
    ingestFlightUpdate(tx, {
      flight_id: flightId,
      snapshot,
      source: options.provider.name === 'simulated' ? 'simulated' : 'live',
      observed_at: options.now,
      provider: options.provider.name,
    }),
  )
}
