// Scripted simulation runs (FR-PL-10, FR-FT-10). A coordinator starts a scenario in simulated
// mode; the run fixes what it acts on (targets.ts: flights, rooms, delegations). The worker then
// applies each step exactly once when its virtual time comes, through the same services as live
// data and staff (steps.ts), so the cascade, proposals and notifications are the real ones.
import type { Kysely } from 'kysely'
import { ApiError } from '@/lib/api/errors'
import type { Tx } from '@/lib/db/context'
import { withSystem } from '@/lib/db/system'
import type { DB } from '@/lib/db/types'
import { type Scenario, type ScenarioStep, dueSteps, findScenario } from '@/lib/domain/simulation/scenarios'
import { logger } from '@/lib/logger'
import { loadTransportEvent } from '@/lib/services/transport/context'
import { applyScenarioStep } from './steps'
import { chooseTargets } from './targets'
import { CURRENT_EVENT_ID } from '@/lib/db/current-event'

/**
 * Virtual time starts two hours before the first target's moment: the first flight lands ("delayed
 * at T−2h", FR-FT-10), or the first guests are due in their room.
 */
const LEAD_MS = 2 * 60 * 60_000

export interface StartRunInput {
  readonly scenario_key: string
  readonly speed: number
}

export interface SimulationRun {
  readonly id: string
  readonly scenario_key: string
  readonly status: string
  readonly speed: number
  readonly flight_ids: string[]
  readonly room_ids: string[]
  readonly delegation_ids: string[]
  readonly virtual_start: Date
  readonly real_start: Date
  readonly steps_applied: number
}

const RUN_COLUMNS = ['id', 'scenario_key', 'status', 'speed', 'flight_ids', 'room_ids', 'delegation_ids', 'virtual_start', 'real_start', 'steps_applied'] as const

/** Runs as the coordinator (RLS: coordinator+). One run at a time (simulation_runs_one_running). */
export async function startSimulationRun(tx: Tx, input: StartRunInput, userId: string): Promise<SimulationRun> {
  const event = await loadTransportEvent(tx)
  if (event.flight_mode !== 'simulated') {
    throw new ApiError(409, 'not_simulated', 'Switch the event to simulated mode before running a scenario')
  }
  const scenario = findScenario(input.scenario_key)
  if (!scenario) throw new ApiError(404, 'not_found', 'Scenario not found')
  const { first_at: firstAt, ...targets } = await chooseTargets(tx, scenario)
  return tx
    .insertInto('simulation_runs')
    .values({
      scenario_key: scenario.key,
      speed: input.speed,
      ...targets,
      virtual_start: new Date((firstAt ?? new Date()).getTime() - LEAD_MS),
      started_by: userId,
    })
    .returning(RUN_COLUMNS)
    .executeTakeFirstOrThrow()
}

export async function stopSimulationRun(tx: Tx, runId: string): Promise<SimulationRun> {
  const run = await tx
    .updateTable('simulation_runs')
    .set({ status: 'stopped', stopped_at: new Date() })
    .where('id', '=', runId)
    .where('status', '=', 'running')
    .returning(RUN_COLUMNS)
    .executeTakeFirst()
  if (!run) throw new ApiError(409, 'not_running', 'This simulation is not running')
  return run
}

/**
 * Takes step number `index` (0-based): only the transaction that moves the counter from `index` to
 * `index + 1` applies the step, so two worker processes can never apply the same step twice.
 */
async function claimStep(tx: Tx, runId: string, index: number): Promise<boolean> {
  const row = await tx
    .updateTable('simulation_runs')
    .set({ steps_applied: index + 1 })
    .where('id', '=', runId)
    .where('status', '=', 'running')
    .where('steps_applied', '=', index)
    .returning('id')
    .executeTakeFirst()
  return row !== undefined
}

async function applyStep(tx: Tx, run: SimulationRun, step: ScenarioStep, index: number, now: Date): Promise<boolean> {
  if (!(await claimStep(tx, run.id, index))) return false
  await applyScenarioStep(tx, run, step, now)
  return true
}

type StillHolder = () => Promise<boolean>

async function advanceRun(db: Kysely<DB>, run: SimulationRun, scenario: Scenario, now: Date, stillHolder?: StillHolder): Promise<number> {
  const steps = dueSteps(scenario, run, now)
  let applied = 0
  for (const [offset, step] of steps.entries()) {
    if (stillHolder && !(await stillHolder())) break
    const index = run.steps_applied + offset
    // One transaction per step: a failing step is logged and counted, and the run goes on.
    try {
      const done = await withSystem(db, { actor: 'system', action: 'simulation.step', reason: `Scenario ${scenario.key}`, undoable: false }, (tx) => applyStep(tx, run, step, index, now))
      if (done) applied += 1
    } catch (error) {
      logger.error('Simulation step failed', { run_id: run.id, error })
      await withSystem(db, { actor: 'system', undoable: false }, (tx) => claimStep(tx, run.id, index))
    }
  }
  await withSystem(db, { actor: 'system', undoable: false }, (tx) =>
    tx
      .updateTable('simulation_runs')
      .set({ status: 'completed', stopped_at: now })
      .where('id', '=', run.id)
      .where('status', '=', 'running')
      .where('steps_applied', '>=', scenario.steps.length)
      .execute(),
  )
  return applied
}

const stopRuns = (db: Kysely<DB>, now: Date, ids: readonly string[]) =>
  withSystem(db, { actor: 'system', undoable: false }, (tx) =>
    tx.updateTable('simulation_runs').set({ status: 'stopped', stopped_at: now }).where('id', 'in', [...ids]).where('status', '=', 'running').execute(),
  )

/**
 * Applies every step that is due in running simulations (worker, every few seconds). Runs stop
 * when the event is no longer in simulated mode: scenarios never touch live data.
 */
export async function advanceSimulationRuns(db: Kysely<DB>, now: Date, stillHolder?: StillHolder): Promise<number> {
  const { runs, mode } = await withSystem(db, { actor: 'system' }, async (tx) => ({
    runs: await tx.selectFrom('simulation_runs').select(RUN_COLUMNS).where('status', '=', 'running').execute(),
    mode: (await tx.selectFrom('events').select('flight_mode').where('id', '=', CURRENT_EVENT_ID).executeTakeFirst())?.flight_mode,
  }))
  if (runs.length === 0) return 0
  if (mode !== 'simulated') {
    logger.warn('Simulation runs stopped: the event is no longer in simulated mode', { runs: runs.length })
    await stopRuns(db, now, runs.map((run) => run.id))
    return 0
  }
  let applied = 0
  for (const run of runs) {
    const scenario = findScenario(run.scenario_key)
    if (!scenario) {
      // A scenario removed from the code since the run started.
      await stopRuns(db, now, [run.id])
      continue
    }
    applied += await advanceRun(db, run, scenario, now, stillHolder)
  }
  return applied
}
