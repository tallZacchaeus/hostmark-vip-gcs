// Arranges flights, parties, drivers and trips for the transport tests (as the database owner).
// Times are UTC; the test event runs in Africa/Lagos (UTC+1) with the default 30 min airport exit
// buffer and 60 min airport drive.
import { EVENT_DAY } from '@/tests/support/event-dates'
import type { TestApp } from './test-app'

export { EVENT_DAY }
const FIRST_NAMES = ['Amina', 'Bola', 'Chidi', 'Dayo', 'Efe', 'Femi', 'Gozie']

export const SHIFT = { starts_at: `${EVENT_DAY}T06:00:00Z`, ends_at: `${EVENT_DAY}T23:30:00Z` }

export interface FlightParty {
  readonly flight_id: string
  readonly delegation_id: string
  readonly arrival_id: string
  readonly pickup_id: string | null
}

export interface PartyOptions {
  readonly delegation: string
  readonly flight_number: string
  readonly scheduled_arrival_at: string
  readonly passengers?: number
  /** Create the airport pickup (30 min after landing); default true. */
  readonly with_pickup?: boolean
}

const first = <T>(rows: T[]): T => {
  const [row] = rows
  if (!row) throw new Error('Expected a row')
  return row
}

export async function addDriver(app: TestApp, fullName: string, capacity: number, profileId: string | null = null): Promise<string> {
  const driver = first(
    await app.sql<{ id: string }>(`insert into drivers (full_name, vehicle_label, vehicle_capacity, profile_id) values ($1, $2, $3, $4) returning id`, [
      fullName,
      `${fullName}'s car`,
      capacity,
      profileId,
    ]),
  )
  await app.sql(`insert into driver_shifts (driver_id, starts_at, ends_at) values ($1, $2, $3)`, [driver.id, SHIFT.starts_at, SHIFT.ends_at])
  return driver.id
}

export async function addFlightParty(app: TestApp, options: PartyOptions): Promise<FlightParty> {
  const passengers = options.passengers ?? 2
  const delegation = first(await app.sql<{ id: string }>(`insert into delegations (name) values ($1) returning id`, [options.delegation]))
  const flight = first(
    await app.sql<{ id: string }>(
      `insert into flights (flight_number, arrival_date_local, scheduled_arrival_at, destination_iata) values ($1, $2, $3, 'LOS') returning id`,
      [options.flight_number, EVENT_DAY, options.scheduled_arrival_at],
    ),
  )
  const landing = new Date(options.scheduled_arrival_at).getTime()
  const arrival = first(
    await app.sql<{ id: string }>(`insert into arrivals (delegation_id, flight_id, mode, expected_at_venue_at) values ($1, $2, 'flying', $3) returning id`, [
      delegation.id,
      flight.id,
      new Date(landing + 90 * 60_000).toISOString(),
    ]),
  )
  for (let index = 0; index < passengers; index += 1) {
    const [guest] = await app.sql<{ id: string }>(`insert into guests (delegation_id, arrival_id, full_name) values ($1, $2, $3) returning id`, [
      delegation.id,
      arrival.id,
      `${FIRST_NAMES[index % FIRST_NAMES.length]} ${options.delegation}`,
    ])
    if (index === 0) await app.sql(`update delegations set principal_guest_id = $2 where id = $1`, [delegation.id, guest?.id])
  }
  if (options.with_pickup === false) return { flight_id: flight.id, delegation_id: delegation.id, arrival_id: arrival.id, pickup_id: null }
  const pickup = first(
    await app.sql<{ id: string }>(
      `insert into pickups (arrival_id, kind, pickup_at, pickup_location, dropoff_location, passenger_count)
       values ($1, 'airport', $2, 'LOS airport, arrivals', 'Grand Hotel', $3) returning id`,
      [arrival.id, new Date(landing + 30 * 60_000).toISOString(), passengers],
    ),
  )
  return { flight_id: flight.id, delegation_id: delegation.id, arrival_id: arrival.id, pickup_id: pickup.id }
}

/** Puts a driver on a pickup, as an approved assignment would. */
export async function assign(app: TestApp, pickupId: string, driverId: string, acknowledged = false): Promise<string> {
  await app.sql(`update pickups set status = 'assigned' where id = $1`, [pickupId])
  const row = first(
    await app.sql<{ id: string }>(`insert into pickup_assignments (pickup_id, driver_id, acknowledged_at) values ($1, $2, $3) returning id`, [
      pickupId,
      driverId,
      acknowledged ? new Date().toISOString() : null,
    ]),
  )
  return row.id
}
