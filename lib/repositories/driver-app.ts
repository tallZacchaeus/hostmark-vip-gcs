// The driver app (FR-FT-09, 03-App-Flow.md /driver). Everything goes through SQL functions that
// only ever act on the signed-in driver's own trips (private.my_driver_id()).
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'

export interface DriverPassenger {
  readonly title: string | null
  readonly full_name: string | null
  readonly role: string
}

/**
 * One of the driver's trips. A trip moved to another driver (`status: 'released'`) carries only
 * its time, party size and principal; the detail fields are present on active and done trips.
 */
export interface DriverTrip {
  readonly assignment_id: string
  readonly status: 'active' | 'released' | 'completed'
  readonly pickup_id: string
  readonly pickup_status: string
  readonly kind: 'airport' | 'location'
  readonly pickup_at: string
  readonly passenger_count: number
  readonly principal: { readonly title: string | null; readonly full_name: string | null; readonly category: string | null }
  readonly released_at?: string | null
  readonly acknowledged_at?: string | null
  readonly en_route_at?: string | null
  readonly picked_up_at?: string | null
  readonly completed_at?: string | null
  readonly previous_pickup_at?: string | null
  readonly changed_at?: string | null
  readonly pickup_location?: string
  readonly dropoff_location?: string | null
  readonly flight_number?: string | null
  readonly flight_phase?: string | null
  readonly delay_minutes?: number | null
  readonly passengers?: DriverPassenger[] | null
}

export type TripStatus = 'en_route' | 'picked_up' | 'completed'

export async function myPickups(tx: Tx, day: string): Promise<DriverTrip[]> {
  const { rows } = await sql<{ trips: DriverTrip[] }>`select public.my_driver_pickups(${day}::date) as trips`.execute(tx)
  return rows[0]?.trips ?? []
}

export async function setTripStatus(tx: Tx, assignmentId: string, status: TripStatus): Promise<{ assignment_id: string; status: TripStatus }> {
  const { rows } = await sql<{ result: { assignment_id: string; status: TripStatus } }>`
    select public.set_trip_status(${assignmentId}::uuid, ${status}) as result`.execute(tx)
  return rows[0]?.result ?? { assignment_id: assignmentId, status }
}

export async function acknowledgeTrip(tx: Tx, assignmentId: string): Promise<{ assignment_id: string }> {
  const { rows } = await sql<{ result: { assignment_id: string } }>`select public.acknowledge_assignment(${assignmentId}::uuid) as result`.execute(tx)
  return rows[0]?.result ?? { assignment_id: assignmentId }
}
