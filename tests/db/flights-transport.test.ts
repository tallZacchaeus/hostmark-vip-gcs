import { describe, expect, it } from 'vitest'
import { EVENT_DAY, addDays } from '@/tests/support/event-dates'
import { useTestDb } from './support/use-test-db'

const DAY = EVENT_DAY

describe('flights and transport (P3 migration)', () => {
  const db = useTestDb()

  /** As the owner: a party on a flight with an airport pickup at 13:30Z for `passengers`. */
  async function arrangePickup(passengers = 2): Promise<{ pickup: string; flight: string }> {
    const delegation = await db().value<string>(`insert into delegations (name) values ('Kenya') returning id`)
    const flight = await db().value<string>(
      `insert into flights (flight_number, arrival_date_local, scheduled_arrival_at) values ('KQ532', $1, $2) returning id`,
      [DAY, `${DAY}T13:00:00Z`],
    )
    const arrival = await db().value<string>(`insert into arrivals (delegation_id, flight_id, mode) values ($1, $2, 'flying') returning id`, [delegation, flight])
    const pickup = await db().value<string>(
      `insert into pickups (arrival_id, kind, pickup_at, pickup_location, passenger_count) values ($1, 'airport', $2, 'LOS arrivals', $3) returning id`,
      [arrival, `${DAY}T13:30:00Z`, passengers],
    )
    return { pickup, flight }
  }

  async function addDriver(capacity: number, profile: string | null = null, shift = true): Promise<string> {
    const driver = await db().value<string>(`insert into drivers (full_name, vehicle_capacity, profile_id) values ('Driver', $1, $2) returning id`, [capacity, profile])
    if (shift) {
      await db().rows(`insert into driver_shifts (driver_id, starts_at, ends_at) values ($1, $2, $3)`, [driver, `${DAY}T06:00:00Z`, `${DAY}T22:00:00Z`])
    }
    return driver
  }

  async function proposeDrivers(pickup: string, driverIds: string[]): Promise<string> {
    await db().asSystem()
    const id = await db().value<string>(
      `select private.create_proposal(p_kind => 'driver_assignment', p_title => 'Assign', p_payload => $1::jsonb,
         p_created_by_type => 'system', p_target_type => 'pickups', p_target_id => $2::uuid)`,
      [JSON.stringify({ pickup_id: pickup, driver_ids: driverIds }), pickup],
    )
    await db().asOwner()
    return id
  }

  it('shows trips to coordinators, the programmes team and the front desk, and to each driver only their own', async () => {
    await db().createEvent()
    const { pickup } = await arrangePickup()
    const driverUser = await db().createProfile('driver')
    const otherUser = await db().createProfile('driver')
    const mine = await addDriver(4, driverUser)
    await addDriver(4, otherUser)
    await db().rows(`insert into pickup_assignments (pickup_id, driver_id) values ($1, $2)`, [pickup, mine])

    const visible: Record<string, number> = {}
    for (const [label, user] of [['driver', driverUser], ['other driver', otherUser]] as const) {
      await db().asUser(user)
      visible[label] = await db().value<number>('select count(*)::int from pickup_assignments')
      await db().asOwner()
    }
    for (const role of ['coordinator', 'accommodation', 'housekeeping'] as const) {
      const user = await db().createProfile(role)
      await db().asUser(user)
      visible[role] = await db().value<number>('select count(*)::int from pickup_assignments')
      await db().asOwner()
    }
    expect(visible).toEqual({ driver: 1, 'other driver': 0, coordinator: 1, accommodation: 1, housekeeping: 0 })

    const coordinator = await db().createProfile('coordinator')
    await db().asUser(coordinator)
    const direct = await db().expectError(() => db().rows(`insert into pickup_assignments (pickup_id, driver_id) values ($1, $2)`, [pickup, mine]))
    expect(direct.code).toBe('42501')
  })

  it('keeps flight updates, provider usage and worker leases away from the API, except reads for coordinators', async () => {
    await db().createEvent()
    const { flight } = await arrangePickup()
    await db().rows(`insert into flight_updates (flight_id, observed_at, source) values ($1, now(), 'live')`, [flight])
    await db().rows(`insert into provider_usage_daily (day, provider, calls) values ($1, 'aerodatabox', 3)`, [DAY])
    const coordinator = await db().createProfile('coordinator')
    const programs = await db().createProfile('programs')

    await db().asUser(coordinator)
    expect(await db().value<number>('select count(*)::int from flight_updates')).toBe(1)
    expect(await db().value<number>('select calls from provider_usage_daily')).toBe(3)
    expect((await db().expectError(() => db().rows(`insert into flight_updates (flight_id, observed_at, source) values ($1, now(), 'manual')`, [flight]))).code).toBe('42501')
    expect((await db().expectError(() => db().rows('select * from worker_leases'))).code).toBe('42501')
    await db().asOwner()
    await db().asUser(programs)
    expect(await db().value<number>('select count(*)::int from flight_updates')).toBe(0)
  })

  it('lets coordinators start and stop simulation runs but not fake their progress, one run at a time', async () => {
    await db().createEvent()
    const coordinator = await db().createProfile('coordinator')
    const programs = await db().createProfile('programs')
    const insert = `insert into simulation_runs (scenario_key, speed, virtual_start, status) values ('single-delay', 60, now(), $1) returning id`

    await db().asUser(programs)
    expect((await db().expectError(() => db().rows(insert, ['running']))).code).toBe('42501')
    await db().asOwner()
    await db().asUser(coordinator)
    expect((await db().expectError(() => db().rows(insert, ['completed']))).code).toBe('42501')
    const run = await db().value<string>(insert, ['running'])
    expect((await db().expectError(() => db().rows(insert, ['running']))).code).toBe('23505')
    expect((await db().expectError(() => db().rows('update simulation_runs set steps_applied = 5 where id = $1', [run]))).code).toBe('42501')
    // What a run acts on is fixed when it starts.
    expect((await db().expectError(() => db().rows(`update simulation_runs set room_ids = '{}', delegation_ids = '{}' where id = $1`, [run]))).code).toBe('42501')
    await db().rows(`update simulation_runs set status = 'stopped', stopped_at = now() where id = $1`, [run])
    expect(await db().value<string>('select status from simulation_runs where id = $1', [run])).toBe('stopped')
  })

  it('re-checks seats and shifts when a driver proposal is approved', async () => {
    await db().createEvent()
    const coordinator = await db().createProfile('coordinator')
    const { pickup } = await arrangePickup(4)
    const small = await addDriver(2)
    const offShift = await addDriver(8, null, false)
    // A newer proposal for the same pickup supersedes the older one, so decide each in turn.
    const approveAsCoordinator = async (proposal: string) => {
      await db().asUser(coordinator)
      const result = await db().value<{ status: string; error: string }>('select public.approve_proposal($1)', [proposal])
      await db().asOwner()
      return result
    }
    const seats = await approveAsCoordinator(await proposeDrivers(pickup, [small]))
    const shift = await approveAsCoordinator(await proposeDrivers(pickup, [offShift]))

    expect(seats).toMatchObject({ status: 'failed', error: 'not_enough_seats' })
    expect(shift).toMatchObject({ status: 'failed', error: 'driver_off_shift' })
    expect(await db().value<number>('select count(*)::int from pickup_assignments')).toBe(0)
  })

  it("shows a driver only the time and party of a trip moved to someone else, and only event days", async () => {
    await db().createEvent()
    const { pickup } = await arrangePickup()
    const driverUser = await db().createProfile('driver')
    const driver = await addDriver(4, driverUser)
    await db().rows(`insert into pickup_assignments (pickup_id, driver_id, status, released_at) values ($1, $2, 'released', now())`, [pickup, driver])

    await db().asUser(driverUser)
    const [moved] = await db().value<Array<Record<string, unknown>>>('select public.my_driver_pickups($1::date)', [DAY])
    expect(moved).toMatchObject({ status: 'released', passenger_count: 2 })
    expect(moved).not.toHaveProperty('passengers')
    expect(moved).not.toHaveProperty('flight_number')
    expect(moved).not.toHaveProperty('pickup_location')
    expect(await db().value('select public.my_driver_pickups($1::date)', [addDays(DAY, 40)])).toEqual([])
  })

  it('keeps trip steps in order and refuses closed pickups', async () => {
    await db().createEvent()
    const { pickup } = await arrangePickup()
    const driverUser = await db().createProfile('driver')
    const driver = await addDriver(4, driverUser)
    const assignment = await db().value<string>(`insert into pickup_assignments (pickup_id, driver_id) values ($1, $2) returning id`, [pickup, driver])

    await db().asUser(driverUser)
    const early = await db().expectError(() => db().rows(`select public.set_trip_status($1, 'picked_up')`, [assignment]))
    expect(early.hint).toBe('not_started')
    await db().asOwner()
    await db().rows(`update pickups set status = 'cancelled' where id = $1`, [pickup])
    await db().asUser(driverUser)
    const closed = await db().expectError(() => db().rows(`select public.set_trip_status($1, 'en_route')`, [assignment]))
    expect(closed.hint).toBe('pickup_closed')
  })

  it('marks a proposal with a malformed payload failed instead of erroring', async () => {
    await db().createEvent()
    const coordinator = await db().createProfile('coordinator')
    const { pickup } = await arrangePickup()
    await db().asSystem()
    const id = await db().value<string>(
      `select private.create_proposal(p_kind => 'driver_assignment', p_title => 'Bad', p_payload => '{"pickup_id": "not-a-uuid", "driver_ids": ["x"]}'::jsonb,
         p_created_by_type => 'system', p_target_type => 'pickups', p_target_id => $1::uuid)`,
      [pickup],
    )
    await db().asOwner()
    await db().asUser(coordinator)

    expect(await db().value('select public.approve_proposal($1)', [id])).toMatchObject({ status: 'failed', error: 'invalid_payload' })
  })

  it('only gives the driver app to staff linked to an active driver', async () => {
    await db().createEvent()
    const unlinked = await db().createProfile('driver')
    const coordinator = await db().createProfile('coordinator')
    const inactiveUser = await db().createProfile('driver')
    const inactive = await addDriver(4, inactiveUser)
    await db().rows('update drivers set is_active = false where id = $1', [inactive])

    for (const user of [unlinked, coordinator, inactiveUser]) {
      await db().asUser(user)
      const error = await db().expectError(() => db().rows('select public.my_driver_pickups($1::date)', [DAY]))
      expect(error.hint).toBe('not_a_driver')
      await db().asOwner()
    }
  })
})
