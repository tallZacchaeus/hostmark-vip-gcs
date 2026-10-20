import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { POST as approve } from '@/app/api/proposals/[id]/approve/route'
import { getSystemDb, withSystem } from '@/lib/db/system'
import type { FlightSnapshot } from '@/lib/flights/provider'
import { type IngestInput, type IngestResult, ingestFlightUpdate } from '@/lib/services/flights/ingest'
import { type Suggestion, suggestDriver, suggestForUnassignedPickups } from '@/lib/services/transport/suggest'
import { type StaffMember, TestApp } from './support/test-app'
import { EVENT_DAY, type FlightParty, addDriver, addFlightParty, assign } from './support/transport-fixture'

const snapshot = (scheduled: string, estimated: string | null, phase: FlightSnapshot['phase'] = 'in_air'): FlightSnapshot => ({
  phase,
  scheduled_arrival_at: scheduled,
  estimated_arrival_at: estimated,
  actual_arrival_at: null,
  origin_iata: 'NBO',
  destination_iata: 'LOS',
})

describe('flight changes, the transport cascade and driver proposals', () => {
  let app: TestApp
  let coordinator: StaffMember
  let adaStaff: StaffMember
  let bayoStaff: StaffMember
  let ada: string
  let bayo: string

  beforeAll(async () => {
    app = await TestApp.start()
    await app.createEvent()
    coordinator = await app.createStaff('coordinator')
    adaStaff = await app.createStaff('driver', { name: 'Ada Obi' })
    bayoStaff = await app.createStaff('driver', { name: 'Bayo Ade' })
    ada = await addDriver(app, 'Ada Obi', 4, adaStaff.id)
    bayo = await addDriver(app, 'Bayo Ade', 4, bayoStaff.id)
  })
  afterAll(async () => {
    await app.stop()
  })

  const ingest = (flightId: string, snap: FlightSnapshot, extra: Partial<IngestInput> = {}): Promise<IngestResult> =>
    withSystem(getSystemDb(), { actor: 'system', action: 'flights.update' }, (tx) =>
      ingestFlightUpdate(tx, { flight_id: flightId, snapshot: snap, source: 'live', observed_at: new Date(), ...extra }),
    )
  const suggest = (pickupId: string): Promise<Suggestion> => withSystem(getSystemDb(), { actor: 'system' }, (tx) => suggestDriver(tx, pickupId))
  const approveAs = (id: string) => app.call<{ status: string; error?: string }>(approve, `/api/proposals/${id}/approve`, { as: coordinator, params: { id }, body: {} })
  const notificationsFor = (profileId: string, kind: string) =>
    app.sql<{ title: string; entity_id: string }>(`select title, entity_id from notifications where recipient_id = $1 and kind = $2 order by created_at`, [profileId, kind])
  const activeDrivers = async (pickupId: string): Promise<string[]> =>
    (await app.sql<{ driver_id: string }>(`select driver_id from pickup_assignments where pickup_id = $1 and status = 'active'`, [pickupId])).map((row) => row.driver_id)

  describe('a delayed flight', () => {
    const scheduled = `${EVENT_DAY}T13:00:00Z`
    let party: FlightParty
    let pickupId: string

    beforeAll(async () => {
      party = await addFlightParty(app, { delegation: 'Kenya', flight_number: 'KQ532', scheduled_arrival_at: scheduled })
      pickupId = party.pickup_id ?? ''
      await assign(app, pickupId, ada, true)
      // Ada also has a 16:30Z airport run for another party (busy 15:30–17:30Z).
      const later = await addFlightParty(app, { delegation: 'Ghana', flight_number: 'KP100', scheduled_arrival_at: `${EVENT_DAY}T16:00:00Z` })
      await assign(app, later.pickup_id ?? '', ada, true)
    })

    it('moves the pickup and keeps the driver when they can still make it, and asks them to confirm again', async () => {
      const result = await ingest(party.flight_id, snapshot(scheduled, `${EVENT_DAY}T13:20:00Z`))

      expect(result.changed).toBe(true)
      expect(result.proposal_ids).toEqual([])
      expect(result.plan?.kept).toEqual([{ pickup_id: pickupId, driver_ids: [ada], pickup_at: `${EVENT_DAY}T13:50:00.000Z` }])
      const [pickup] = await app.sql<{ pickup_at: Date; previous_pickup_at: Date; changed_at: Date | null }>(
        `select pickup_at, previous_pickup_at, changed_at from pickups where id = $1`,
        [pickupId],
      )
      expect(pickup?.pickup_at.toISOString()).toBe(`${EVENT_DAY}T13:50:00.000Z`)
      expect(pickup?.previous_pickup_at.toISOString()).toBe(`${EVENT_DAY}T13:30:00.000Z`)
      expect(pickup?.changed_at).not.toBeNull()
      const [arrival] = await app.sql<{ expected_at_venue_at: Date }>(`select expected_at_venue_at from arrivals where id = $1`, [party.arrival_id])
      expect(arrival?.expected_at_venue_at.toISOString()).toBe(`${EVENT_DAY}T14:50:00.000Z`)
      const [assignment] = await app.sql<{ acknowledged_at: Date | null }>(`select acknowledged_at from pickup_assignments where pickup_id = $1 and status = 'active'`, [pickupId])
      expect(assignment?.acknowledged_at).toBeNull()
      expect(await notificationsFor(adaStaff.id, 'pickup_time_changed')).toEqual([{ title: 'Pickup moved to 14:50', entity_id: pickupId }])
    })

    it('records the update with its source, the changes and how long the cascade took', async () => {
      const updates = await app.sql<{ source: string; changes: Record<string, unknown>; cascade_ms: number | null; cascade_completed_at: Date | null }>(
        `select source, changes, cascade_ms, cascade_completed_at from flight_updates where flight_id = $1`,
        [party.flight_id],
      )
      expect(updates).toHaveLength(1)
      expect(updates[0]?.source).toBe('live')
      expect(Object.keys(updates[0]?.changes ?? {}).sort()).toEqual(['estimated_arrival_at', 'origin_iata', 'phase'])
      expect(updates[0]?.cascade_ms).toBeGreaterThanOrEqual(0)
      expect(updates[0]?.cascade_completed_at).not.toBeNull()
      const [flight] = await app.sql<{ last_checked_at: Date | null; next_check_at: Date | null }>(`select last_checked_at, next_check_at from flights where id = $1`, [party.flight_id])
      expect(flight?.last_checked_at).not.toBeNull()
      expect(flight?.next_check_at).not.toBeNull()
    })

    it('ignores a poll that changes nothing', async () => {
      const result = await ingest(party.flight_id, snapshot(scheduled, `${EVENT_DAY}T13:20:00Z`))

      expect(result).toMatchObject({ changed: false, flight_update_id: null, plan: null })
      const [count] = await app.sql<{ n: number }>(`select count(*)::int as n from flight_updates where flight_id = $1`, [party.flight_id])
      expect(count?.n).toBe(1)
    })

    it('proposes another driver when the current one can no longer make it, and approval hands the trip over', async () => {
      const result = await ingest(party.flight_id, snapshot(scheduled, `${EVENT_DAY}T14:30:00Z`))

      expect(result.proposal_ids).toHaveLength(1)
      const proposalId = result.proposal_ids[0] ?? ''
      const [proposal] = await app.sql<{ kind: string; payload: { pickup_id: string; driver_ids: string[] }; rationale: { also_changes: string }; target_id: string; trigger_type: string }>(
        `select kind, payload, rationale, target_id, trigger_type from proposals where id = $1`,
        [proposalId],
      )
      expect(proposal).toMatchObject({ kind: 'driver_reassignment', target_id: pickupId, trigger_type: 'flight_update' })
      expect(proposal?.payload).toEqual({ pickup_id: pickupId, driver_ids: [bayo] })
      expect(proposal?.rationale.also_changes).toBe('Pickup moves from 14:50 to 16:00')
      // The time moves at once; the driver change waits for a person (P1).
      expect(await activeDrivers(pickupId)).toEqual([ada])

      const approved = await approveAs(proposalId)

      expect(approved.status).toBe(200)
      expect(approved.body.data.status).toBe('approved')
      expect(await activeDrivers(pickupId)).toEqual([bayo])
      expect(await notificationsFor(adaStaff.id, 'pickup_moved')).toEqual([{ title: 'The 16:00 pickup was moved to another driver', entity_id: pickupId }])
      expect(await notificationsFor(bayoStaff.id, 'pickup_assigned')).toEqual([{ title: 'New pickup at 16:00: LOS airport, arrivals', entity_id: pickupId }])
    })
  })

  it('creates the airport pickup for a party that has none and proposes a driver for it', async () => {
    const scheduled = `${EVENT_DAY}T09:00:00Z`
    const party = await addFlightParty(app, { delegation: 'Rwanda', flight_number: 'WB202', scheduled_arrival_at: scheduled, passengers: 3, with_pickup: false })

    const result = await ingest(party.flight_id, snapshot(scheduled, `${EVENT_DAY}T09:10:00Z`))

    const pickups = await app.sql<{ id: string; kind: string; passenger_count: number; pickup_at: Date }>(`select id, kind, passenger_count, pickup_at from pickups where arrival_id = $1`, [party.arrival_id])
    expect(pickups).toHaveLength(1)
    expect(pickups[0]).toMatchObject({ kind: 'airport', passenger_count: 3 })
    expect(pickups[0]?.pickup_at.toISOString()).toBe(`${EVENT_DAY}T09:40:00.000Z`)
    const [proposal] = await app.sql<{ kind: string; target_id: string }>(`select kind, target_id from proposals where id = $1`, [result.proposal_ids[0]])
    expect(proposal).toEqual({ kind: 'driver_assignment', target_id: pickups[0]?.id })
  })

  it('flags a cancelled flight and proposes releasing its pickup', async () => {
    const scheduled = `${EVENT_DAY}T11:00:00Z`
    const party = await addFlightParty(app, { delegation: 'Senegal', flight_number: 'HF404', scheduled_arrival_at: scheduled })
    const pickupId = party.pickup_id ?? ''
    await assign(app, pickupId, bayo)

    const result = await ingest(party.flight_id, snapshot(scheduled, null, 'cancelled'))

    const [arrival] = await app.sql<{ attention: string | null }>(`select attention from arrivals where id = $1`, [party.arrival_id])
    expect(arrival?.attention).toBe('Flight HF404 cancelled')
    expect(await notificationsFor(coordinator.id, 'flight_disrupted')).toContainEqual({ title: 'Flight HF404 cancelled', entity_id: party.arrival_id })
    expect(result.proposal_ids).toHaveLength(1)

    const approved = await approveAs(result.proposal_ids[0] ?? '')

    expect(approved.body.data.status).toBe('approved')
    const [pickup] = await app.sql<{ status: string }>(`select status from pickups where id = $1`, [pickupId])
    expect(pickup?.status).toBe('cancelled')
    expect(await activeDrivers(pickupId)).toEqual([])
    expect(await notificationsFor(bayoStaff.id, 'pickup_cancelled')).toHaveLength(1)
  })

  it('withdraws release suggestions and clears the flag when a cancelled flight flies again', async () => {
    const scheduled = `${EVENT_DAY}T11:30:00Z`
    const party = await addFlightParty(app, { delegation: 'Gabon', flight_number: 'GB505', scheduled_arrival_at: scheduled })
    const cancelled = await ingest(party.flight_id, snapshot(scheduled, null, 'cancelled'))
    expect(cancelled.proposal_ids).toHaveLength(1)

    await ingest(party.flight_id, snapshot(scheduled, `${EVENT_DAY}T12:00:00Z`))

    const [release] = await app.sql<{ status: string }>(`select status from proposals where id = $1`, [cancelled.proposal_ids[0]])
    expect(release?.status).toBe('expired')
    const [arrival] = await app.sql<{ attention: string | null }>(`select attention from arrivals where id = $1`, [party.arrival_id])
    expect(arrival?.attention).toBeNull()
  })

  describe('suggestions outside a flight change', () => {
    it('suggests a free driver once for each upcoming pickup without one', async () => {
      const party = await addFlightParty(app, { delegation: 'Togo', flight_number: 'ET901', scheduled_arrival_at: `${EVENT_DAY}T19:00:00Z` })
      const now = new Date(`${EVENT_DAY}T08:00:00Z`)
      const run = () => withSystem(getSystemDb(), { actor: 'system' }, (tx) => suggestForUnassignedPickups(tx, now))

      expect(await run()).toBeGreaterThanOrEqual(1)
      const proposals = await app.sql<{ kind: string; status: string }>(`select kind, status from proposals where target_id = $1`, [party.pickup_id])
      expect(proposals).toEqual([{ kind: 'driver_assignment', status: 'pending' }])
      expect(await run()).toBe(0)
    })

    it('marks an approval failed when the proposed driver has since become busy', async () => {
      const party = await addFlightParty(app, { delegation: 'Benin', flight_number: 'AT555', scheduled_arrival_at: `${EVENT_DAY}T21:00:00Z` })
      const pickupId = party.pickup_id ?? ''
      const suggestion = await suggest(pickupId)
      if (!('proposal_id' in suggestion)) throw new Error(`Expected a proposal, got ${suggestion.reason}`)
      const [proposal] = await app.sql<{ payload: { driver_ids: string[] } }>(`select payload from proposals where id = $1`, [suggestion.proposal_id])
      const chosen = proposal?.payload.driver_ids[0] ?? ''
      const clash = await addFlightParty(app, { delegation: 'Niger', flight_number: 'AT556', scheduled_arrival_at: `${EVENT_DAY}T21:05:00Z` })
      await assign(app, clash.pickup_id ?? '', chosen)

      const approved = await approveAs(suggestion.proposal_id)

      expect(approved.body.data).toMatchObject({ status: 'failed', error: 'driver_busy' })
      const [row] = await app.sql<{ status: string; execution_error: string }>(`select status, execution_error from proposals where id = $1`, [suggestion.proposal_id])
      expect(row).toEqual({ status: 'failed', execution_error: 'driver_busy' })
      expect(await activeDrivers(pickupId)).toEqual([])
    })

    it('says so when nobody is free', async () => {
      const party = await addFlightParty(app, { delegation: 'Mali', flight_number: 'XX001', scheduled_arrival_at: `${EVENT_DAY}T23:00:00Z` })

      // 23:30Z pickup: its drive ends after every shift does.
      expect(await suggest(party.pickup_id ?? '')).toEqual({ reason: 'no_driver_free' })
    })
  })
})
