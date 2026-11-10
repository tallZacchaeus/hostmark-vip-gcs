// P9 step 9.3 (docs/06-Implementation-Plan.md): the event each request works in. Staff list and
// switch their events; new accounts join the inviter's event; a registration link files into its
// own event; the background worker serves every event that is not archived.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { POST as register } from '@/app/api/intake/[token]/route'
import { GET as me } from '@/app/api/me/route'
import { PUT as switchEvent } from '@/app/api/me/event/route'
import { GET as listRooms } from '@/app/api/admin/rooms/route'
import { POST as createUser } from '@/app/api/admin/users/route'
import { getSystemDb, withSystem } from '@/lib/db/system'
import { runWorkerTick } from '@/lib/services/worker/tick'
import { EVENT_DAY, EVENT_LAST_DAY } from '@/tests/support/event-dates'
import { type StaffMember, TestApp } from './support/test-app'
import { addDriver, addFlightParty } from './support/transport-fixture'

vi.stubEnv('DATABASE_URL', 'pglite://memory')
vi.stubEnv('SERVICE_DATABASE_URL', 'pglite://memory')
vi.stubEnv('BETTER_AUTH_SECRET', 'integration-test-secret-'.padEnd(48, 'x'))
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')

interface MeBody {
  event: { id: string; name: string } | null
  events: Array<{ id: string; name: string; is_current: boolean }>
}

describe('the event each request works in (P9 step 9.3)', () => {
  let app: TestApp
  let admin: StaffMember
  let alpha: string
  let beta: string
  let gamma: string

  beforeAll(async () => {
    app = await TestApp.start()
    admin = await app.createStaff('admin')
    // Alpha (the first event) takes in existing staff; Beta and Gamma add people explicitly.
    alpha = await app.createEvent()
    const [second, third] = await app.sql<{ id: string }>(
      `insert into events (name, venue_name, timezone, starts_on, ends_on, status) values
         ('Beta Forum', 'Beta Hall', 'Africa/Lagos', $1, $2, 'live'),
         ('Gamma Expo', 'Gamma Hall', 'Africa/Lagos', $1, $2, 'live')
       returning id`,
      [EVENT_DAY, EVENT_LAST_DAY],
    )
    beta = second?.id ?? ''
    gamma = third?.id ?? ''
    await app.sql(`insert into event_members (event_id, profile_id) values ($1, $2)`, [beta, admin.id])
    for (const [event, number] of [[alpha, 'A1'], [beta, 'B1']] as const) {
      await app.inEvent(event, async () => {
        const [type] = await app.sql<{ id: string }>(`insert into room_types (name, tier, default_capacity, cleaning_minutes) values ('Std', 1, 2, 30) returning id`)
        await app.sql(`insert into rooms (number, floor, wing, room_type_id) values ($1, 1, 'East', $2)`, [number, type?.id])
      })
    }
  })
  afterAll(async () => {
    vi.unstubAllEnvs()
    await app.stop()
  })

  const roomNumbers = async () =>
    (await app.call<Array<{ number: string }>>(listRooms, '/api/admin/rooms', { as: admin })).body.data.map((room) => room.number)

  it('lists the events a person works on and switches between them', async () => {
    // Act
    await app.call(switchEvent, '/api/me/event', { as: admin, method: 'PUT', body: { event_id: alpha } })
    const before = await app.call<MeBody>(me, '/api/me', { as: admin })
    const roomsBefore = await roomNumbers()
    const switched = await app.call(switchEvent, '/api/me/event', { as: admin, method: 'PUT', body: { event_id: beta } })
    const after = await app.call<MeBody>(me, '/api/me', { as: admin })
    const roomsAfter = await roomNumbers()

    // Assert
    expect(before.body.data.events.map((event) => event.id).sort()).toEqual([alpha, beta].sort())
    expect(switched.status).toBe(200)
    expect(after.body.data.event?.id).toBe(beta)
    expect(after.body.data.events.find((event) => event.is_current)?.id).toBe(beta)
    expect(before.body.data.event?.id).toBe(alpha)
    expect(roomsBefore).toEqual(['A1'])
    expect(roomsAfter).toEqual(['B1'])
  })

  it('keeps each request in the event its screen sent, even after a switch elsewhere', async () => {
    // Arrange: the profile's choice is Beta (another tab switched), but this screen shows Alpha.
    await app.call(switchEvent, '/api/me/event', { as: admin, method: 'PUT', body: { event_id: beta } })

    // Act
    const rooms = await app.call<Array<{ number: string }>>(listRooms, '/api/admin/rooms', { as: admin, headers: { 'x-event-id': alpha } })
    const foreign = await app.call(listRooms, '/api/admin/rooms', { as: admin, headers: { 'x-event-id': gamma } })

    // Assert
    expect(rooms.body.data.map((room) => room.number)).toEqual(['A1'])
    expect(foreign.status).toBe(409)
    expect(foreign.body.error?.code).toBe('event_not_found')
  })

  it('refuses system work on behalf of a person when no event is known', async () => {
    // Act
    const attempt = withSystem(getSystemDb(), { actor: 'system', onBehalfOf: admin.id }, async () => 'ran')

    // Assert
    await expect(attempt).rejects.toMatchObject({ status: 409, code: 'event_not_found' })
  })

  it('refuses to switch to an event the person does not work on', async () => {
    // Act
    const result = await app.call(switchEvent, '/api/me/event', { as: admin, method: 'PUT', body: { event_id: gamma } })

    // Assert
    expect(result.status).toBe(404)
  })

  it("adds a new account to the inviter's current event only", async () => {
    // Arrange
    await app.call(switchEvent, '/api/me/event', { as: admin, method: 'PUT', body: { event_id: beta } })

    // Act
    const created = await app.call<{ account: { id: string } }>(createUser, '/api/admin/users', {
      as: admin,
      body: { email: 'beta.driver@example.com', full_name: 'Beta Driver', role: 'driver' },
    })

    // Assert
    const events = await app.sql<{ event_id: string }>(`select event_id from event_members where profile_id = $1`, [created.body.data.account.id])
    expect(events).toEqual([{ event_id: beta }])
  })

  it("files a registration into its own link's event, not the one the system would pick by default", async () => {
    // Arrange: Gamma is neither the first event nor the oldest live one (that is Beta).
    const [link] = await app.sql<{ intake_token: string }>(`update events set intake_open = true where id = $1 returning intake_token`, [gamma])
    const token = link?.intake_token ?? ''

    // Act
    const result = await app.call<{ reference_code: string }>(register, `/api/intake/${token}`, {
      body: {
        form: {
          full_name: 'Gamma Guest', contact_name: 'Gamma Guest', contact_email: 'gamma.guest@example.org',
          arrival_mode: 'own_transport', arrival_date: EVENT_DAY, arrival_time: '10:00', departure_date: EVENT_LAST_DAY,
        },
        consent: true,
      },
      params: { token },
      headers: { 'x-forwarded-for': '203.0.113.90' },
    })

    // Assert
    expect(result.status).toBe(201)
    const [submission] = await app.sql<{ event_id: string }>(`select event_id from intake_submissions where reference_code = $1`, [result.body.data.reference_code])
    expect(submission?.event_id).toBe(gamma)
  })

  it('serves every event that is not archived in one worker pass, each in its own event', async () => {
    // Arrange: a pickup needing a driver, and a free driver, in Alpha and in Gamma.
    const pickups: Record<string, string> = {}
    for (const [event, label] of [[alpha, 'Alpha'], [gamma, 'Gamma']] as const) {
      await app.inEvent(event, async () => {
        await addDriver(app, `${label} Driver`, 4)
        const party = await addFlightParty(app, { delegation: `${label} Party`, flight_number: label === 'Alpha' ? 'ET901' : 'ET902', scheduled_arrival_at: `${EVENT_DAY}T10:00:00Z` })
        pickups[event] = party.pickup_id ?? ''
      })
    }

    // Act
    await runWorkerTick(getSystemDb(), { holder: 'test', now: new Date(`${EVENT_DAY}T06:00:00Z`), poll: true, dailyLimit: 10 })

    // Assert
    const proposals = await app.sql<{ event_id: string; target_id: string }>(
      `select event_id, target_id from proposals where kind = 'driver_assignment' and target_id = any ($1::uuid[])`,
      [Object.values(pickups)],
    )
    expect(proposals).toHaveLength(2)
    for (const proposal of proposals) {
      expect(pickups[proposal.event_id]).toBe(proposal.target_id)
    }
  })
})
