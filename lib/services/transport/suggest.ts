// Driver suggestions outside a flight change (FR-FT-06): for a pickup the coordinator asks about
// ("Suggest a driver"), and for every upcoming pickup that still has no driver and no pending
// suggestion — the worker runs this each tick, so new registrations get a proposal on their own.
import { sql } from 'kysely'
import { ApiError } from '@/lib/api/errors'
import type { Tx } from '@/lib/db/context'
import { type PickupStatus, assignmentProposal } from '@/lib/domain/transport/cascade'
import { type PickupKind, matchDrivers } from '@/lib/domain/transport/matcher'
import { type TransportContext, loadTransportContext } from './context'
import { createDriverProposal } from './proposals'

const SUGGEST_AHEAD_MS = 48 * 60 * 60_000

interface PickupRow {
  readonly id: string
  readonly kind: PickupKind
  readonly pickup_at: Date
  readonly pickup_location: string
  readonly passenger_count: number
  readonly status: PickupStatus
  readonly delegation_name: string
  readonly driver_ids: string[]
}

export type Suggestion = { readonly proposal_id: string } | { readonly reason: 'no_driver_free' | 'already_covered' }

async function loadPickup(tx: Tx, pickupId: string): Promise<PickupRow | undefined> {
  const { rows } = await sql<PickupRow>`
    select p.id, p.kind, p.pickup_at, p.pickup_location, p.passenger_count, p.status, d.name as delegation_name,
      coalesce(array_agg(pa.driver_id::text) filter (where pa.status = 'active'), '{}') as driver_ids
    from public.pickups p
    join public.arrivals a on a.id = p.arrival_id
    join public.delegations d on d.id = a.delegation_id
    left join public.pickup_assignments pa on pa.pickup_id = p.id
    where p.id = ${pickupId}::uuid
    group by p.id, d.name`.execute(tx)
  return rows[0]
}

export async function suggestDriver(tx: Tx, pickupId: string, known?: TransportContext): Promise<Suggestion> {
  const pickup = await loadPickup(tx, pickupId)
  if (!pickup) throw new ApiError(404, 'not_found', 'Pickup not found')
  if (pickup.status !== 'pending_assignment' && pickup.status !== 'assigned') {
    throw new ApiError(409, 'pickup_closed', 'This pickup is already under way, done or cancelled')
  }
  const context = known ?? (await loadTransportContext(tx))
  const pickupAt = new Date(pickup.pickup_at).toISOString()
  const match = matchDrivers(
    { pickup_id: pickup.id, pickup_at: pickupAt, kind: pickup.kind, passenger_count: pickup.passenger_count, current_driver_ids: pickup.driver_ids },
    context.drivers,
    context.shifts,
    context.trips,
    context.event,
  )
  if (!match) return { reason: 'no_driver_free' }
  if (match.kept) return { reason: 'already_covered' }
  const planned = assignmentProposal({ ...pickup, pickup_at: pickupAt }, pickup.delegation_name, match, context.drivers, context.event.timezone)
  const proposal = pickup.driver_ids.length > 0 ? { ...planned, kind: 'driver_reassignment' as const, title: planned.title.replace('Assign a driver', 'Reassign the driver') } : planned
  return { proposal_id: await createDriverProposal(tx, proposal, pickup.id, context.drivers, null) }
}

/** Upcoming pickups with no driver and no pending suggestion get one (when someone is free). */
export async function suggestForUnassignedPickups(tx: Tx, now: Date): Promise<number> {
  const { rows } = await sql<{ id: string }>`
    select p.id from public.pickups p
    where p.status = 'pending_assignment'
      and p.pickup_at between ${now.toISOString()}::timestamptz and ${new Date(now.getTime() + SUGGEST_AHEAD_MS).toISOString()}::timestamptz
      and not exists (select 1 from public.pickup_assignments a where a.pickup_id = p.id and a.status = 'active')
      and not exists (
        select 1 from public.proposals pr
        where pr.status = 'pending' and pr.target_type = 'pickups' and pr.target_id = p.id
      )
    order by p.pickup_at`.execute(tx)
  if (rows.length === 0) return 0
  let context = await loadTransportContext(tx)
  let created = 0
  for (const row of rows) {
    const suggestion = await suggestDriver(tx, row.id, context)
    if (!('proposal_id' in suggestion)) continue
    created += 1
    // The new suggestion holds its driver: the next pickup must see that.
    context = await loadTransportContext(tx)
  }
  return created
}
