// One pass of the background worker (02-TRD.md §3.2): simulation steps; every minute, flight
// checks and driver and room suggestions. Only one process works at a time, whether
// the app server or `pnpm worker`: a pass first claims a short lease (worker_leases), renewed on
// every pass; a crashed holder's lease simply runs out. Each part is isolated, so a failing
// flight check never stops simulation steps or driver suggestions.
import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import { inSystemEvent, withSystem } from '@/lib/db/system'
import type { DB } from '@/lib/db/types'
import { logger } from '@/lib/logger'
import { type PollReport, pollDueFlights } from '@/lib/services/flights/poll'
import { advanceSimulationRuns } from '@/lib/services/simulation/runner'
import { loadTransportEvent } from '@/lib/services/transport/context'
import { suggestRoomsForNewGuests } from '@/lib/services/rooms/suggest'
import { suggestForUnassignedPickups } from '@/lib/services/transport/suggest'
import { flightProviderFor } from './provider'

const LEASE_NAME = 'worker'
export const LEASE_MS = 30_000

export interface TickOptions {
  /** Identifies this process in the lease. */
  readonly holder: string
  readonly now: Date
  /** Check flights and suggest drivers on this pass (every minute); simulation steps run every pass. */
  readonly poll: boolean
  readonly aeroDataBoxKey?: string
  readonly dailyLimit: number
}

export interface TickReport {
  readonly simulation_steps: number
  readonly poll: PollReport | null
  readonly suggestions: number
  readonly room_suggestions: number
}

export async function claimLease(db: Kysely<DB>, holder: string, now: Date): Promise<boolean> {
  const { rows } = await withSystem(db, { actor: 'system' }, (tx) =>
    sql<{ holder: string }>`
      insert into public.worker_leases as l (name, holder, expires_at)
      values (${LEASE_NAME}, ${holder}, ${new Date(now.getTime() + LEASE_MS).toISOString()}::timestamptz)
      on conflict (name) do update set holder = excluded.holder, expires_at = excluded.expires_at
      where l.expires_at < ${now.toISOString()}::timestamptz or l.holder = excluded.holder
      returning holder`.execute(tx),
  )
  return rows.length === 1
}

async function isolated<T>(part: string, fallback: T, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    logger.error('Worker part failed', { part, error })
    return fallback
  }
}

async function pollFlights(db: Kysely<DB>, options: TickOptions, stillHolder: () => Promise<boolean>): Promise<PollReport | null> {
  const event = await withSystem(db, { actor: 'system' }, (tx) => loadTransportEvent(tx))
  const provider = flightProviderFor(event, options.aeroDataBoxKey)
  if (!provider) return null
  return pollDueFlights(db, { provider, now: options.now, dailyLimit: options.dailyLimit, stillHolder })
}

const EMPTY_REPORT: TickReport = { simulation_steps: 0, poll: null, suggestions: 0, room_suggestions: 0 }

function mergePolls(a: PollReport | null, b: PollReport | null): PollReport | null {
  if (!a || !b) return a ?? b
  return { checked: a.checked + b.checked, changed: a.changed + b.changed, failed: a.failed + b.failed, quota_reached: a.quota_reached || b.quota_reached }
}

function mergeReports(a: TickReport, b: TickReport): TickReport {
  return {
    simulation_steps: a.simulation_steps + b.simulation_steps,
    poll: mergePolls(a.poll, b.poll),
    suggestions: a.suggestions + b.suggestions,
    room_suggestions: a.room_suggestions + b.room_suggestions,
  }
}

/** Events the worker serves (P9): every event that is not archived, oldest first. A new install has none. */
async function workingEvents(db: Kysely<DB>): Promise<string[]> {
  const rows = await withSystem(db, { actor: 'system' }, (tx) =>
    tx.selectFrom('events').select('id').where('status', '<>', 'archived').orderBy('created_at').orderBy('id').execute(),
  )
  return rows.map((row) => row.id)
}

/**
 * Runs one pass over every working event, each in its own event context (so defaults, settings
 * and notifications belong to that event), or returns null when another process holds the lease.
 */
export async function runWorkerTick(db: Kysely<DB>, options: TickOptions): Promise<TickReport | null> {
  if (!(await claimLease(db, options.holder, options.now))) return null
  // Long passes renew the lease between units of work and stop as soon as it is lost.
  const stillHolder = () => claimLease(db, options.holder, new Date(Math.max(Date.now(), options.now.getTime())))
  let report = EMPTY_REPORT
  for (const eventId of await workingEvents(db)) {
    if (!(await stillHolder())) break
    report = mergeReports(report, await inSystemEvent(eventId, () => runEventPass(db, options, stillHolder)))
  }
  return report
}

async function runEventPass(db: Kysely<DB>, options: TickOptions, stillHolder: () => Promise<boolean>): Promise<TickReport> {
  const simulationSteps = await isolated('simulation', 0, () => advanceSimulationRuns(db, options.now, stillHolder))
  if (!options.poll) return { simulation_steps: simulationSteps, poll: null, suggestions: 0, room_suggestions: 0 }
  const poll = await isolated('flights', null, () => pollFlights(db, options, stillHolder))
  const suggestions = await isolated('suggestions', 0, () =>
    withSystem(db, { actor: 'system', action: 'transport.suggest', undoable: false }, (tx) => suggestForUnassignedPickups(tx, options.now)),
  )
  const roomSuggestions = await isolated('rooms', 0, () =>
    withSystem(db, { actor: 'system', action: 'rooms.suggest', undoable: false }, (tx) => suggestRoomsForNewGuests(tx, options.now)),
  )
  return { simulation_steps: simulationSteps, poll, suggestions, room_suggestions: roomSuggestions }
}
