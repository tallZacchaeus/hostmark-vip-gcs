// P9 step 9.4 (docs/06-Implementation-Plan.md): the Events API. Programme Managers create and run
// their events; staff are assigned per event; setup is copied into a new draft.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PATCH as setStatus } from '@/app/api/events/[id]/route'
import { POST as copySetup } from '@/app/api/events/[id]/copy/route'
import { GET as listStaff, PUT as setMember } from '@/app/api/events/[id]/staff/route'
import { GET as listEvents, POST as createEvent } from '@/app/api/events/route'
import { POST as resetPassword } from '@/app/api/admin/users/[id]/reset-password/route'
import { PATCH as updateUser } from '@/app/api/admin/users/[id]/route'
import { GET as me } from '@/app/api/me/route'
import { type StaffMember, TestApp } from './support/test-app'

vi.stubEnv('DATABASE_URL', 'pglite://memory')
vi.stubEnv('SERVICE_DATABASE_URL', 'pglite://memory')
vi.stubEnv('BETTER_AUTH_SECRET', 'integration-test-secret-'.padEnd(48, 'x'))
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')

const NEW_EVENT = { name: 'Abuja Investment Forum', venue_name: 'Congress Hall', timezone: 'Africa/Lagos', starts_on: '2027-03-01', ends_on: '2027-03-03' }

interface ManagedEvent {
  id: string
  name: string
  status: string
  member_count: number
}

describe('the Events API (P9 step 9.4)', () => {
  let app: TestApp
  let manager: StaffMember
  let otherManager: StaffMember
  let admin: StaffMember
  let coordinator: StaffMember
  let live: string

  beforeAll(async () => {
    app = await TestApp.start()
    manager = await app.createStaff('programme_manager')
    otherManager = await app.createStaff('programme_manager')
    admin = await app.createStaff('admin')
    coordinator = await app.createStaff('coordinator')
    live = await app.createEvent()
    await app.sql(`update events set owner_id = $1, status = 'live' where id = $2`, [manager.id, live])
    await app.sql(`delete from event_members where profile_id = $1`, [otherManager.id])
    await app.inEvent(live, async () => {
      const [type] = await app.sql<{ id: string }>(`insert into room_types (name, tier, default_capacity, cleaning_minutes) values ('Std', 1, 2, 30) returning id`)
      await app.sql(`insert into rooms (number, floor, wing, room_type_id) values ('101', 1, 'East', $1)`, [type?.id])
    })
  })
  afterAll(async () => {
    vi.unstubAllEnvs()
    await app.stop()
  })

  const create = (as: StaffMember) => app.call<{ id: string; status: string; owner_id: string }>(createEvent, '/api/events', { as, body: NEW_EVENT })

  it('lets Programme Managers create draft events they own, and nobody below them', async () => {
    // Act
    const byAdmin = await create(admin)
    const byCoordinator = await create(coordinator)
    const created = await create(manager)

    // Assert
    expect(byAdmin.status).toBe(403)
    expect(byCoordinator.status).toBe(403)
    expect(created.status).toBe(201)
    expect(created.body.data).toMatchObject({ status: 'draft', owner_id: manager.id })
  })

  it("lists a manager's own events only", async () => {
    // Act
    const mine = await app.call<ManagedEvent[]>(listEvents, '/api/events', { as: manager })
    const theirs = await app.call<ManagedEvent[]>(listEvents, '/api/events', { as: otherManager })

    // Assert
    expect(mine.body.data.map((event) => event.status).sort()).toEqual(['draft', 'live'])
    expect(theirs.body.data).toEqual([])
  })

  it('keeps one live event per manager and archives', async () => {
    // Arrange
    const draft = (await create(manager)).body.data.id
    const patch = (id: string, status: string, as = manager) =>
      app.call<{ status: string }>(setStatus, `/api/events/${id}`, { as, method: 'PATCH', body: { status }, params: { id } })

    // Act
    const tooMany = await patch(draft, 'live')
    const foreign = await patch(draft, 'archived', otherManager)
    const invalid = await patch(draft, 'draft')
    const archived = await patch(draft, 'archived')

    // Assert
    expect(tooMany.status).toBe(409)
    expect(tooMany.body.error?.code).toBe('live_event_exists')
    expect(foreign.status).toBe(404)
    expect(invalid.status).toBe(400)
    expect(archived.body.data.status).toBe('archived')
  })

  it('assigns staff to a new event, who then find it in their list of events', async () => {
    // Arrange
    const draft = (await create(manager)).body.data.id

    // Act
    const staff = await app.call<Array<{ id: string; is_member: boolean }>>(listStaff, `/api/events/${draft}/staff`, { as: manager, params: { id: draft } })
    const added = await app.call(setMember, `/api/events/${draft}/staff`, {
      as: manager,
      method: 'PUT',
      body: { profile_id: coordinator.id, member: true },
      params: { id: draft },
    })
    const coordinatorMe = await app.call<{ events: Array<{ id: string }> }>(me, '/api/me', { as: coordinator })

    // Assert
    expect(staff.body.data.find((person) => person.id === coordinator.id)?.is_member).toBe(false)
    expect(added.status).toBe(200)
    expect(coordinatorMe.body.data.events.map((event) => event.id)).toContain(draft)
  })

  it('copies rooms from the live event into a draft, once', async () => {
    // Arrange
    const draft = (await create(manager)).body.data.id
    const copy = () =>
      app.call<Record<string, number>>(copySetup, `/api/events/${draft}/copy`, {
        as: manager,
        body: { from_event_id: live, parts: ['rooms'] },
        params: { id: draft },
      })

    // Act
    const first = await copy()
    const second = await copy()

    // Assert
    expect(first.body.data).toEqual({ room_types: 1, rooms: 1 })
    expect(second.status).toBe(409)
    expect(second.body.error?.code).toBe('already_set_up')
  })

  it('rejects an empty copy request', async () => {
    // Act
    const result = await app.call(copySetup, `/api/events/${live}/copy`, {
      as: manager,
      body: { from_event_id: live, parts: [] },
      params: { id: live },
    })

    // Assert
    expect(result.status).toBe(400)
  })
  it("refuses to reset or change an account that also works on another manager's event, before anything changes", async () => {
    // Arrange: the other manager runs their own event; a Super Admin shared the coordinator with it.
    const [theirs] = await app.sql<{ id: string }>(
      `insert into events (name, venue_name, timezone, starts_on, ends_on, status, owner_id)
       values ('Kano Trade Fair', 'Expo Hall', 'Africa/Lagos', '2027-05-01', '2027-05-02', 'live', $1) returning id`,
      [otherManager.id],
    )
    const theirEvent = theirs?.id ?? ''
    await app.sql(`insert into event_members (event_id, profile_id) values ($1, $2) on conflict do nothing`, [theirEvent, coordinator.id])
    const hash = () => app.sql<{ password: string }>(`select password from auth_accounts where user_id = $1`, [coordinator.id])
    const before = await hash()

    // Act
    const reset = await app.call(resetPassword, `/api/admin/users/${coordinator.id}/reset-password`, {
      as: otherManager,
      params: { id: coordinator.id },
      headers: { 'x-event-id': theirEvent },
    })
    const renamed = await app.call(updateUser, `/api/admin/users/${coordinator.id}`, {
      as: otherManager,
      method: 'PATCH',
      body: { full_name: 'Taken Over' },
      params: { id: coordinator.id },
      headers: { 'x-event-id': theirEvent },
    })

    // Assert
    expect(reset.status).toBe(403)
    expect(reset.body.error?.message).toMatch(/event you do not manage/)
    expect(renamed.status).toBe(403)
    expect(await hash()).toEqual(before)
  })
})
