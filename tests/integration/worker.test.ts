import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getSystemDb } from '@/lib/db/system'
import type { FlightProvider } from '@/lib/flights/provider'
import { pollDueFlights, refreshFlight } from '@/lib/services/flights/poll'
import { LEASE_MS, claimLease, runWorkerTick } from '@/lib/services/worker/tick'
import { type StaffMember, TestApp } from './support/test-app'
import { EVENT_DAY, type FlightParty, addDriver, addFlightParty } from './support/transport-fixture'

vi.stubEnv('DATABASE_URL', 'pglite://memory')
vi.stubEnv('SERVICE_DATABASE_URL', 'pglite://memory')
vi.stubEnv('BETTER_AUTH_SECRET', 'integration-test-secret-'.padEnd(48, 'x'))
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')

/** A stand-in live provider: every flight is 30 minutes late. */
const lateProvider = (calls: string[]): FlightProvider => ({
  name: 'aerodatabox',
  async getStatus(flight) {
    calls.push(flight.flight_number)
    const scheduled = new Date(flight.scheduled_arrival_at ?? 0).getTime()
    return {
      phase: 'in_air',
      scheduled_arrival_at: new Date(scheduled).toISOString(),
      estimated_arrival_at: new Date(scheduled + 30 * 60_000).toISOString(),
      actual_arrival_at: null,
      origin_iata: 'ADD',
      destination_iata: 'LOS',
    }
  },
})

describe('background worker', () => {
  let app: TestApp
  let coordinator: StaffMember
  let flights: FlightParty[]
  const now = new Date(`${EVENT_DAY}T08:00:00Z`)

  beforeAll(async () => {
    app = await TestApp.start()
    await app.createEvent()
    coordinator = await app.createStaff('coordinator')
    await addDriver(app, 'Ada Obi', 4)
    flights = []
    for (const [index, hour] of ['10', '11', '12'].entries()) {
      flights.push(await addFlightParty(app, { delegation: `Party ${index + 1}`, flight_number: `ET${900 + index}`, scheduled_arrival_at: `${EVENT_DAY}T${hour}:00:00Z` }))
    }
  })
  afterAll(async () => {
    await app.stop()
  })

  it('lets one process work at a time, until its lease runs out', async () => {
    const db = getSystemDb()
    expect(await claimLease(db, 'server-a', now)).toBe(true)
    expect(await claimLease(db, 'server-b', now)).toBe(false)
    expect(await claimLease(db, 'server-a', new Date(now.getTime() + 1_000))).toBe(true)
    expect(await claimLease(db, 'server-b', new Date(now.getTime() + LEASE_MS + 2_000))).toBe(true)
    expect(await runWorkerTick(db, { holder: 'server-a', now: new Date(now.getTime() + LEASE_MS + 3_000), poll: false, dailyLimit: 10 })).toBeNull()
  })

  it('counts live calls per day, warns coordinators at 80% and pauses at the limit', async () => {
    const calls: string[] = []

    const report = await pollDueFlights(getSystemDb(), { provider: lateProvider(calls), now, dailyLimit: 2 })

    expect(report).toEqual({ checked: 2, changed: 2, failed: 0, quota_reached: true })
    expect(calls).toEqual(['ET900', 'ET901'])
    const [usage] = await app.sql<{ calls: number }>(`select calls from provider_usage_daily where provider = 'aerodatabox'`)
    expect(usage?.calls).toBe(2)
    const warnings = await app.sql<{ title: string }>(`select title from notifications where recipient_id = $1 and kind = 'provider_quota'`, [coordinator.id])
    expect(warnings).toEqual([{ title: 'Flight data: 2 of 2 calls used today' }])
    // Checked flights wait for their next slot.
    const [checked] = await app.sql<{ next_check_at: Date | null }>('select next_check_at from flights where id = $1', [flights[0]?.flight_id])
    expect(checked?.next_check_at?.getTime()).toBeGreaterThan(now.getTime())
  })

  it('refuses a manual check once the limit is used up', async () => {
    await expect(
      refreshFlight(getSystemDb(), flights[2]?.flight_id ?? '', { provider: lateProvider([]), now, dailyLimit: 2, userId: coordinator.id }),
    ).rejects.toMatchObject({ status: 429, code: 'quota_reached' })
  })

  it('does not let "Check now" be hammered: a cooldown per flight and part of the quota kept for the worker', async () => {
    const provider = lateProvider([])
    const options = { provider, dailyLimit: 100, userId: coordinator.id }

    await expect(refreshFlight(getSystemDb(), flights[0]?.flight_id ?? '', { ...options, now: new Date(now.getTime() + 30_000) })).rejects.toMatchObject({ status: 429, code: 'checked_recently' })
    // 2 calls used, so a manual cap of 80% of 3 (= 2) is already reached; the worker's share is left.
    await expect(refreshFlight(getSystemDb(), flights[1]?.flight_id ?? '', { ...options, dailyLimit: 3, now: new Date(now.getTime() + 5 * 60_000) })).rejects.toMatchObject({ code: 'quota_reached' })
  })

  it('keeps going when the provider fails, and checks that flight again later', async () => {
    const failing: FlightProvider = { name: 'aerodatabox', getStatus: async () => Promise.reject(new Error('timeout')) }

    const report = await pollDueFlights(getSystemDb(), { provider: failing, now, dailyLimit: 100 })

    expect(report).toMatchObject({ checked: 0, failed: 1, quota_reached: false })
    const [flight] = await app.sql<{ next_check_at: Date }>('select next_check_at from flights where id = $1', [flights[2]?.flight_id])
    expect(flight?.next_check_at.toISOString()).toBe(new Date(now.getTime() + 10 * 60_000).toISOString())
  })

  it('runs a full pass: simulated flight checks and driver suggestions, never offering a held driver twice', async () => {
    // Ada is already suggested for the first late flight, which overlaps the others: she is held.
    await addDriver(app, 'Bola Ade', 7)

    const report = await runWorkerTick(getSystemDb(), { holder: 'server-c', now: new Date(now.getTime() + 20 * 60_000 + LEASE_MS * 4), poll: true, dailyLimit: 10 })

    expect(report).not.toBeNull()
    expect(report?.poll).not.toBeNull()
    expect(report?.suggestions).toBeGreaterThanOrEqual(1)
    const perDriver = await app.sql<{ full_name: string; n: number }>(
      `select d.full_name, count(*)::int as n from proposals pr
       cross join lateral jsonb_array_elements_text(pr.payload -> 'driver_ids') x
       join drivers d on d.id = x.value::uuid
       where pr.status = 'pending' and pr.kind = 'driver_assignment' group by d.full_name order by d.full_name`,
    )
    expect(perDriver).toEqual([
      { full_name: 'Ada Obi', n: 1 },
      { full_name: 'Bola Ade', n: 1 },
    ])
  })
})
