// Applies one scripted step through the same services as live data and staff, so the reactions are
// the real ones: a flight change goes through ingestFlightUpdate (the transport cascade and room
// follow-ups); a room taken out of service is saved as an Admin's edit would be, then its stays are
// re-planned (reworkRoom: a move proposal, or a coordinator alert); companions are added as a
// coordinator adds party members, and the worker's minute pass suggests rooms for them.
// vip_system, inside the transaction that claims the step (runner.ts).
import type { Tx } from '@/lib/db/context'
import type { FlightPhase } from '@/lib/domain/flights/schedule'
import { type DelegationStep, type FlightStep, type RoomStep, type ScenarioStep, applyChange } from '@/lib/domain/simulation/scenarios'
import { logger } from '@/lib/logger'
import { createCrudRepository } from '@/lib/repositories/crud'
import { ingestFlightUpdate } from '@/lib/services/flights/ingest'
import { addMember } from '@/lib/services/guests'
import { reworkRoom } from '@/lib/services/rooms/suggest'
import { memberCreateSchema } from '@/lib/validation/guests'

export interface StepRun {
  readonly id: string
  readonly flight_ids: readonly string[]
  readonly room_ids: readonly string[]
  readonly delegation_ids: readonly string[]
}

// The repository behind Settings → Rooms (lib/resources/venue.ts); only `update` is used here.
const rooms = createCrudRepository('rooms', [])

/** An unnamed companion, as "Add member" with only a role creates one. */
const COMPANION = memberCreateSchema.parse({ member_role: 'other' })
/** Companions resolve no extracted issue, so nobody is recorded as resolving one. */
const NO_RESOLVER = ''

const skipped = (run: StepRun, what: string, index: number): void => {
  logger.warn(`Simulation step skipped: its ${what} is gone`, { run_id: run.id, [what]: index })
}

async function applyFlightStep(tx: Tx, run: StepRun, step: FlightStep, now: Date): Promise<void> {
  const flightId = run.flight_ids[step.flight]
  const flight = flightId
    ? await tx
        .selectFrom('flights')
        .select(['flight_number', 'arrival_date_local', 'phase', 'scheduled_arrival_at', 'estimated_arrival_at', 'actual_arrival_at', 'manual_arrival_at', 'origin_iata', 'destination_iata'])
        .where('id', '=', flightId)
        .executeTakeFirst()
    : undefined
  if (!flightId || !flight) return skipped(run, 'flight', step.flight)
  const snapshot = applyChange({ ...flight, phase: flight.phase as FlightPhase }, step.change)
  await ingestFlightUpdate(tx, { flight_id: flightId, snapshot, source: 'simulated', observed_at: now, simulation_run_id: run.id, provider: 'simulated' })
}

async function applyRoomStep(tx: Tx, run: StepRun, step: RoomStep, now: Date): Promise<void> {
  const roomId = run.room_ids[step.room]
  const updated = roomId ? await rooms.update(tx, roomId, { out_of_service: true }) : undefined
  if (!roomId || !updated) return skipped(run, 'room', step.room)
  await reworkRoom(tx, roomId, now, { type: 'room', id: roomId })
}

async function applyDelegationStep(tx: Tx, run: StepRun, step: DelegationStep): Promise<void> {
  const delegationId = run.delegation_ids[step.delegation]
  if (!delegationId) return skipped(run, 'delegation', step.delegation)
  for (let added = 0; added < step.change.count; added += 1) {
    await addMember(tx, delegationId, COMPANION, NO_RESOLVER)
  }
}

export async function applyScenarioStep(tx: Tx, run: StepRun, step: ScenarioStep, now: Date): Promise<void> {
  if ('flight' in step) return applyFlightStep(tx, run, step, now)
  if ('room' in step) return applyRoomStep(tx, run, step, now)
  return applyDelegationStep(tx, run, step)
}
