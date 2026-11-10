// Writes a cascade plan (lib/domain/transport/cascade.ts) in the caller's vip_system transaction:
// new times, new pickups, proposals, and the notices — drivers whose trip moved (they confirm it
// again) and coordinators when a flight is disrupted or nobody can take a trip.
import type { Tx } from '@/lib/db/context'
import { type CascadePlan, clock } from '@/lib/domain/transport/cascade'
import { notifyCoordinators, notifyCoordinatorsOnce, notifyUsers } from '@/lib/services/notify'
import { reworkStays } from '@/lib/services/rooms/suggest'
import type { TransportContext } from './context'
import { type Trigger, createDriverProposal } from './proposals'

export interface PlanOrigin {
  readonly flight_id: string
  readonly trigger: Trigger | null
}

async function driverProfiles(tx: Tx, driverIds: readonly string[]): Promise<(string | null)[]> {
  if (driverIds.length === 0) return []
  const rows = await tx.selectFrom('drivers').select('profile_id').where('id', 'in', [...driverIds]).execute()
  return rows.map((row) => row.profile_id)
}

async function applyTimes(tx: Tx, plan: CascadePlan): Promise<string[]> {
  for (const arrival of plan.arrivals) {
    await tx.updateTable('arrivals').set({ expected_at_venue_at: arrival.expected_at_venue_at, attention: arrival.attention }).where('id', '=', arrival.id).execute()
  }
  for (const pickup of plan.pickup_times) {
    await tx
      .updateTable('pickups')
      .set({ pickup_at: pickup.pickup_at, previous_pickup_at: pickup.previous_pickup_at, changed_at: new Date() })
      .where('id', '=', pickup.id)
      .execute()
  }
  const created: string[] = []
  for (const pickup of plan.new_pickups) {
    const row = await tx.insertInto('pickups').values({ ...pickup, kind: 'airport' }).returning('id').executeTakeFirstOrThrow()
    created.push(row.id)
  }
  return created
}

/**
 * A pending driver suggestion was worked out for the old pickup time. When the time moves and this
 * plan does not replace it (a new proposal supersedes the old one itself), it is withdrawn, so
 * nobody approves a driver for a time that no longer exists and the driver it held is free again.
 */
async function withdrawStale(tx: Tx, movedPickupIds: readonly string[], replaced: ReadonlySet<string>): Promise<void> {
  const stale = movedPickupIds.filter((id) => !replaced.has(id))
  if (stale.length === 0) return
  await tx
    .updateTable('proposals')
    .set({ status: 'expired', decided_at: new Date(), decision_note: 'The pickup time changed; this suggestion no longer fits.' })
    .where('status', '=', 'pending')
    .where('target_type', '=', 'pickups')
    .where('target_id', 'in', stale)
    .where('kind', 'in', ['driver_assignment', 'driver_reassignment'])
    .execute()
}

/**
 * The flight is flying again (no longer cancelled or diverted): suggestions to release its pickups
 * no longer apply, and its parties no longer need attention for it.
 */
export async function clearDisruption(tx: Tx, flightId: string): Promise<void> {
  const arrivals = tx.selectFrom('arrivals').select('id').where('flight_id', '=', flightId)
  await tx
    .updateTable('proposals')
    .set({ status: 'expired', decided_at: new Date(), decision_note: 'The flight is no longer cancelled or diverted.' })
    .where('status', '=', 'pending')
    .where('kind', '=', 'release_pickup')
    .where('target_type', '=', 'pickups')
    .where('target_id', 'in', tx.selectFrom('pickups').select('id').where('arrival_id', 'in', arrivals))
    .execute()
  await tx.updateTable('arrivals').set({ attention: null }).where('flight_id', '=', flightId).where('attention', 'is not', null).execute()
}

export async function applyCascadePlan(tx: Tx, plan: CascadePlan, context: TransportContext, origin: PlanOrigin): Promise<string[]> {
  const created = await applyTimes(tx, plan)
  // Rooms follow the new arrival times (FR-RA-07): stays move, and a room that no longer works is re-planned.
  await reworkStays(tx, plan.arrivals.map((arrival) => arrival.id), new Date(), origin.trigger)
  const proposalIds: string[] = []
  const replaced = new Set<string>()
  for (const proposal of plan.proposals) {
    const pickupId = proposal.pickup_id ?? (proposal.new_pickup_index === null ? undefined : created[proposal.new_pickup_index])
    if (!pickupId) continue
    proposalIds.push(await createDriverProposal(tx, proposal, pickupId, context.drivers, origin.trigger))
    replaced.add(pickupId)
  }
  await withdrawStale(tx, plan.pickup_times.map((pickup) => pickup.id), replaced)
  for (const kept of plan.kept) {
    // The driver keeps the trip at the new time and confirms it again in the app.
    await tx.updateTable('pickup_assignments').set({ acknowledged_at: null }).where('pickup_id', '=', kept.pickup_id).where('status', '=', 'active').execute()
    await notifyUsers(tx, await driverProfiles(tx, kept.driver_ids), {
      kind: 'pickup_time_changed',
      title: `Pickup moved to ${clock(kept.pickup_at, context.event.timezone)}`,
      priority: 'high',
      entity_type: 'pickups',
      entity_id: kept.pickup_id,
    })
  }
  for (const arrival of plan.arrivals.filter((item) => item.attention)) {
    await notifyCoordinators(tx, { kind: 'flight_disrupted', title: arrival.attention ?? 'Flight disrupted', priority: 'high', entity_type: 'arrivals', entity_id: arrival.id })
  }
  for (const alert of plan.alerts) {
    // The same "no driver free" situation is raised by every later update: tell people once.
    await notifyCoordinatorsOnce(tx, {
      kind: 'transport_alert',
      title: alert.title,
      priority: 'high',
      entity_type: alert.pickup_id ? 'pickups' : 'flights',
      entity_id: alert.pickup_id ?? origin.flight_id,
    })
  }
  return proposalIds
}
