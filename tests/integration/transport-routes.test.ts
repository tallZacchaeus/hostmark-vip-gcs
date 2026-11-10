import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { GET as arrivals } from '@/app/api/arrivals/route'
import { POST as acknowledge } from '@/app/api/driver/assignments/[id]/acknowledge/route'
import { POST as tripStatus } from '@/app/api/driver/assignments/[id]/status/route'
import { GET as driverPickups } from '@/app/api/driver/pickups/route'
import { POST as override } from '@/app/api/flights/[id]/override/route'
import { POST as refresh } from '@/app/api/flights/[id]/refresh/route'
import { POST as suggest } from '@/app/api/pickups/[id]/suggest/route'
import { GET as simulationOptions } from '@/app/api/simulation/options/route'
import { POST as stopRun } from '@/app/api/simulation/runs/[id]/stop/route'
import { GET as listRuns, POST as startRun } from '@/app/api/simulation/runs/route'
import { POST as whatIf } from '@/app/api/simulation/what-if/route'
import { GET as transport } from '@/app/api/transport/route'
import { getSystemDb } from '@/lib/db/system'
import type { ArrivalsBoard } from '@/lib/repositories/arrivals'
import type { DriverTrip } from '@/lib/repositories/driver-app'
import type { RunSummary } from '@/lib/repositories/simulation'
import type { TransportBoard } from '@/lib/repositories/transport'
import { advanceSimulationRuns } from '@/lib/services/simulation/runner'
import type { WhatIfResult } from '@/lib/services/simulation/what-if'
import { type StaffMember, TestApp } from './support/test-app'
import { EVENT_DAY, type FlightParty, addDriver, addFlightParty, assign } from './support/transport-fixture'

vi.stubEnv('DATABASE_URL', 'pglite://memory')
vi.stubEnv('SERVICE_DATABASE_URL', 'pglite://memory')
vi.stubEnv('BETTER_AUTH_SECRET', 'integration-test-secret-'.padEnd(48, 'x'))
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')

describe('flights, transport, driver app and simulation API', () => {
  let app: TestApp
  let coordinator: StaffMember
  let programs: StaffMember
  let adaStaff: StaffMember
  let bayoStaff: StaffMember
  let ada: string
  let kenya: FlightParty
  let rwanda: FlightParty
  let adaAssignment: string

  beforeAll(async () => {
    app = await TestApp.start()
    await app.createEvent()
    coordinator = await app.createStaff('coordinator')
    programs = await app.createStaff('programs')
    adaStaff = await app.createStaff('driver', { name: 'Ada Obi' })
    bayoStaff = await app.createStaff('driver', { name: 'Bayo Ade' })
    ada = await addDriver(app, 'Ada Obi', 4, adaStaff.id)
    await addDriver(app, 'Bayo Ade', 4, bayoStaff.id)
    await addDriver(app, 'Cy Eze', 7)
    kenya = await addFlightParty(app, { delegation: 'Kenya', flight_number: 'KQ532', scheduled_arrival_at: `${EVENT_DAY}T13:00:00Z` })
    rwanda = await addFlightParty(app, { delegation: 'Rwanda', flight_number: 'WB202', scheduled_arrival_at: `${EVENT_DAY}T15:00:00Z`, passengers: 3 })
    adaAssignment = await assign(app, kenya.pickup_id ?? '', ada)
  })
  afterAll(async () => {
    await app.stop()
  })

  const as = (staff: StaffMember) => ({ as: staff })

  describe('boards', () => {
    it("shows the arrivals board for the next day with arrivals, with flight, pickup and driver", async () => {
      const result = await app.call<ArrivalsBoard>(arrivals, '/api/arrivals', as(coordinator))

      expect(result.status).toBe(200)
      expect(result.body.data.day).toBe(EVENT_DAY)
      const row = result.body.data.rows.find((item) => item.arrival_id === kenya.arrival_id)
      expect(row).toMatchObject({ delegation_name: 'Kenya', principal_name: 'Amina Kenya', party_size: 2, status: 'due', drivers: ['Ada Obi'] })
      expect(row?.flight).toMatchObject({ flight_number: 'KQ532', phase: 'scheduled' })
      expect(row?.pickup?.pickup_at).toBe(`${EVENT_DAY}T13:30:00.000Z`)
    })

    it('keeps the boards to coordinators', async () => {
      expect((await app.call(arrivals, '/api/arrivals', as(programs))).status).toBe(403)
      expect((await app.call(transport, '/api/transport', as(adaStaff))).status).toBe(403)
    })

    it('lists pickups without a driver, and a suggestion appears as a decision and a ghost block', async () => {
      const before = await app.call<TransportBoard>(transport, `/api/transport?day=${EVENT_DAY}`, as(coordinator))
      expect(before.body.data.needs_driver.map((trip) => trip.pickup_id)).toEqual([rwanda.pickup_id])
      expect(before.body.data.drivers.find((driver) => driver.id === ada)?.trips).toMatchObject([{ pickup_id: kenya.pickup_id, state: 'planned', label: 'Kenya +1' }])

      const suggested = await app.call<{ proposal_id: string }>(suggest, `/api/pickups/${rwanda.pickup_id}/suggest`, { ...as(coordinator), params: { id: rwanda.pickup_id ?? '' }, body: {} })
      expect(suggested.status).toBe(200)

      const after = await app.call<TransportBoard>(transport, `/api/transport?day=${EVENT_DAY}`, as(coordinator))
      expect(after.body.data.decisions).toMatchObject([{ proposal_id: suggested.body.data.proposal_id, kind: 'driver_assignment', pickup_id: rwanda.pickup_id }])
      const ghosts = after.body.data.drivers.flatMap((driver) => driver.trips.filter((trip) => trip.state === 'suggested'))
      expect(ghosts.map((trip) => trip.proposal_id)).toEqual([suggested.body.data.proposal_id])
    })
  })

  describe('flight times', () => {
    const call = (body: unknown) => app.call<{ changed: boolean }>(override, `/api/flights/${kenya.flight_id}/override`, { ...as(coordinator), params: { id: kenya.flight_id }, body })

    it("sets a manual landing time that moves the pickup, recorded as the coordinator's change", async () => {
      const result = await call({ manual_arrival_at: `${EVENT_DAY}T15:00:00+01:00` })

      expect(result.body.data.changed).toBe(true)
      const [pickup] = await app.sql<{ pickup_at: Date }>('select pickup_at from pickups where id = $1', [kenya.pickup_id])
      expect(pickup?.pickup_at.toISOString()).toBe(`${EVENT_DAY}T14:30:00.000Z`)
      const audit = await app.sql<{ actor_type: string; actor_id: string }>(
        `select actor_type, actor_id from audit_log where entity_type = 'flights' and entity_id = $1 and action = 'flights.override'`,
        [kenya.flight_id],
      )
      expect(audit).toEqual([{ actor_type: 'user', actor_id: coordinator.id }])
    })

    it('clears the manual time, and rejects times without a time zone', async () => {
      expect((await call({ manual_arrival_at: `${EVENT_DAY}T15:00:00` })).status).toBe(400)
      await call({ manual_arrival_at: null })
      const [pickup] = await app.sql<{ pickup_at: Date }>('select pickup_at from pickups where id = $1', [kenya.pickup_id])
      expect(pickup?.pickup_at.toISOString()).toBe(`${EVENT_DAY}T13:30:00.000Z`)
    })

    it('checks a flight now in simulated mode, and explains when live data is not set up', async () => {
      const options = { ...as(coordinator), params: { id: kenya.flight_id }, body: {} }
      expect((await app.call(refresh, `/api/flights/${kenya.flight_id}/refresh`, options)).status).toBe(200)

      await app.sql(`update events set flight_mode = 'live'`)
      const live = await app.call(refresh, `/api/flights/${kenya.flight_id}/refresh`, options)
      await app.sql(`update events set flight_mode = 'simulated'`)
      expect(live.status).toBe(409)
      expect(live.body.error?.code).toBe('no_provider')
    })
  })

  describe('driver app', () => {
    const status = (staff: StaffMember, id: string, value: string) =>
      app.call<{ status: string }>(tripStatus, `/api/driver/assignments/${id}/status`, { as: staff, params: { id }, body: { status: value } })

    it("lists only the signed-in driver's trips, with passengers and flight", async () => {
      const result = await app.call<{ trips: DriverTrip[] }>(driverPickups, `/api/driver/pickups?day=${EVENT_DAY}`, as(adaStaff))

      expect(result.body.data.trips).toHaveLength(1)
      expect(result.body.data.trips[0]).toMatchObject({ assignment_id: adaAssignment, flight_number: 'KQ532', passenger_count: 2 })
      expect(result.body.data.trips[0]?.passengers).toHaveLength(2)
      const bayo = await app.call<{ trips: DriverTrip[] }>(driverPickups, `/api/driver/pickups?day=${EVENT_DAY}`, as(bayoStaff))
      expect(bayo.body.data.trips).toEqual([])
    })

    it("refuses other drivers' trips, staff who are not drivers, and steps out of order", async () => {
      expect((await status(bayoStaff, adaAssignment, 'en_route')).status).toBe(404)
      expect((await app.call(driverPickups, '/api/driver/pickups', as(coordinator))).status).toBe(403)
      const unlinked = await app.createStaff('driver')
      expect((await app.call(driverPickups, '/api/driver/pickups', as(unlinked))).body.error?.code).toBe('not_a_driver')
      const early = await status(adaStaff, adaAssignment, 'completed')
      expect(early.status).toBe(409)
      expect(early.body.error?.code).toBe('not_picked_up')
    })

    it('acknowledges, then runs the trip to the end, which marks the party as arrived', async () => {
      const ack = await app.call(acknowledge, `/api/driver/assignments/${adaAssignment}/acknowledge`, { ...as(adaStaff), params: { id: adaAssignment }, body: {} })
      expect(ack.status).toBe(200)

      for (const step of ['en_route', 'picked_up', 'completed']) {
        expect((await status(adaStaff, adaAssignment, step)).status).toBe(200)
      }

      const [arrival] = await app.sql<{ status: string }>('select status from arrivals where id = $1', [kenya.arrival_id])
      expect(arrival?.status).toBe('arrived')
      const guests = await app.sql<{ status: string }>('select status from guests where arrival_id = $1', [kenya.arrival_id])
      expect(guests.every((guest) => guest.status === 'arrived')).toBe(true)
      expect((await status(adaStaff, adaAssignment, 'en_route')).body.error?.code).toBe('not_active')
    })
  })

  describe('simulation', () => {
    it('offers scenarios, flights and drivers', async () => {
      const result = await app.call<{ flight_mode: string; scenarios: unknown[]; flights: { flight_number: string }[] }>(simulationOptions, '/api/simulation/options', as(coordinator))

      expect(result.body.data.flight_mode).toBe('simulated')
      expect(result.body.data.scenarios.length).toBeGreaterThanOrEqual(5)
      expect(result.body.data.flights.map((flight) => flight.flight_number)).toContain('WB202')
    })

    it('previews a delay without changing anything', async () => {
      const [before] = await app.sql<{ n: number }>('select count(*)::int as n from flight_updates')
      const result = await app.call<WhatIfResult>(whatIf, '/api/simulation/what-if', { ...as(coordinator), body: { kind: 'flight_delay', flight_id: rwanda.flight_id, minutes: 90 } })

      expect(result.status).toBe(200)
      expect(result.body.data.headline).toContain('WB202 90 min late')
      expect(result.body.data.lines.some((line) => line.kind === 'time')).toBe(true)
      const [after] = await app.sql<{ n: number }>('select count(*)::int as n from flight_updates')
      expect(after?.n).toBe(before?.n)
      expect((await app.call(whatIf, '/api/simulation/what-if', { ...as(coordinator), body: { kind: 'flight_delay', flight_id: rwanda.flight_id, minutes: 9999 } })).status).toBe(400)
    })

    it('runs a scripted scenario through the live pipeline, one run at a time', async () => {
      const started = await app.call<{ id: string; flight_ids: string[] }>(startRun, '/api/simulation/runs', { ...as(coordinator), body: { scenario_key: 'single-delay', speed: 60 } })
      expect(started.status).toBe(201)
      expect(started.body.data.flight_ids).toEqual([rwanda.flight_id])
      const second = await app.call(startRun, '/api/simulation/runs', { ...as(coordinator), body: { scenario_key: 'cancellation' } })
      expect(second.status).toBe(409)

      expect(await advanceSimulationRuns(getSystemDb(), new Date(Date.now() + 60_000))).toBe(1)

      const updates = await app.sql<{ source: string; simulation_run_id: string }>('select source, simulation_run_id from flight_updates where flight_id = $1', [rwanda.flight_id])
      expect(updates).toEqual([{ source: 'simulated', simulation_run_id: started.body.data.id }])
      const runs = await app.call<{ runs: RunSummary[] }>(listRuns, '/api/simulation/runs', as(coordinator))
      expect(runs.body.data.runs[0]).toMatchObject({ status: 'completed', steps_applied: 1, steps_total: 1, flight_numbers: ['WB202'] })
      const stop = await app.call(stopRun, `/api/simulation/runs/${started.body.data.id}/stop`, { ...as(coordinator), params: { id: started.body.data.id }, body: {} })
      expect(stop.body.error?.code).toBe('not_running')
    })

    it('applies a step once even when two worker passes race, and stops runs when the event goes live', async () => {
      const second = await addFlightParty(app, { delegation: 'Burundi', flight_number: 'WB303', scheduled_arrival_at: `${EVENT_DAY}T17:00:00Z` })
      const started = await app.call<{ id: string }>(startRun, '/api/simulation/runs', { ...as(coordinator), body: { scenario_key: 'rolling-delays', speed: 1 } })
      expect(started.status).toBe(201)
      // At 1× only the first step (at 0 min) is due a minute in; each step must be applied once.
      const later = new Date(Date.now() + 60_000)

      const applied = await Promise.all([advanceSimulationRuns(getSystemDb(), later), advanceSimulationRuns(getSystemDb(), later)])

      expect(applied[0] + applied[1]).toBe(1)
      const [run] = await app.sql<{ steps_applied: number; status: string }>('select steps_applied, status from simulation_runs where id = $1', [started.body.data.id])
      expect(run).toEqual({ steps_applied: 1, status: 'running' })

      await app.sql(`update events set flight_mode = 'live'`)
      expect(await advanceSimulationRuns(getSystemDb(), new Date(Date.now() + 30 * 60_000))).toBe(0)
      await app.sql(`update events set flight_mode = 'simulated'`)
      const [stopped] = await app.sql<{ status: string }>('select status from simulation_runs where id = $1', [started.body.data.id])
      expect(stopped?.status).toBe('stopped')
      expect(second.flight_id).toBeTruthy()
    })

    it('needs simulated mode for scripted runs, and a known scenario', async () => {
      expect((await app.call(startRun, '/api/simulation/runs', { ...as(coordinator), body: { scenario_key: 'nope' } })).status).toBe(400)
      await app.sql(`update events set flight_mode = 'live'`)
      const live = await app.call(startRun, '/api/simulation/runs', { ...as(coordinator), body: { scenario_key: 'single-delay' } })
      await app.sql(`update events set flight_mode = 'simulated'`)
      expect(live.body.error?.code).toBe('not_simulated')
    })
  })
})
