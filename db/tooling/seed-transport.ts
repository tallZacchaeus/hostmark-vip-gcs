// Transport demo data (P3) on top of the seeded guests, made through the real pipeline: two
// parties already have a driver (ET512 with the driver login's account), ET512 then runs 40
// minutes late — the driver keeps the trip and is asked to confirm the new time — and the
// matcher suggests drivers for the other pickups of the first two days.
import { type Kysely, sql } from 'kysely'
import type { DB } from '@/lib/db/types'
import { ingestFlightUpdate } from '@/lib/services/flights/ingest'
import { suggestForUnassignedPickups } from '@/lib/services/transport/suggest'

const DELAY_MIN = 40
/** Seeded flight → index of the driver who already has it (0 is linked to the driver login). */
const ASSIGNED: Readonly<Record<string, number>> = { ET512: 0, BA75: 2 }
const DELAYED_FLIGHT = 'ET512'

export interface TransportSeedResult {
  readonly assigned: number
  readonly suggestions: number
}

export async function seedTransport(db: Kysely<DB>, startsOn: string, driverIds: readonly string[]): Promise<TransportSeedResult> {
  return db.transaction().execute(async (tx) => {
    await sql`select private.set_audit_context(p_actor_type => 'system', p_action => 'seed', p_undoable => false)`.execute(tx)
    const pickups = await tx
      .selectFrom('pickups as p')
      .innerJoin('arrivals as a', 'a.id', 'p.arrival_id')
      .innerJoin('flights as f', 'f.id', 'a.flight_id')
      .select(['p.id', 'f.flight_number'])
      .where('p.status', '=', 'pending_assignment')
      .execute()
    let assigned = 0
    for (const pickup of pickups) {
      const driverId = driverIds[ASSIGNED[pickup.flight_number] ?? -1]
      if (!driverId) continue
      await tx.insertInto('pickup_assignments').values({ pickup_id: pickup.id, driver_id: driverId, acknowledged_at: new Date() }).execute()
      await tx.updateTable('pickups').set({ status: 'assigned' }).where('id', '=', pickup.id).execute()
      assigned += 1
    }

    const flight = await tx.selectFrom('flights').selectAll().where('flight_number', '=', DELAYED_FLIGHT).executeTakeFirst()
    if (flight?.scheduled_arrival_at) {
      const scheduled = new Date(flight.scheduled_arrival_at)
      await ingestFlightUpdate(tx, {
        flight_id: flight.id,
        snapshot: {
          phase: 'in_air',
          scheduled_arrival_at: scheduled.toISOString(),
          estimated_arrival_at: new Date(scheduled.getTime() + DELAY_MIN * 60_000).toISOString(),
          actual_arrival_at: null,
          origin_iata: flight.origin_iata,
          destination_iata: flight.destination_iata,
        },
        source: 'simulated',
        observed_at: new Date(),
        provider: 'simulated',
      })
    }
    const suggestions = await suggestForUnassignedPickups(tx, new Date(`${startsOn}T00:00:00Z`))
    return { assigned, suggestions }
  })
}
