// Edge cases across resources: 404s, filters, reactivation and permission branches.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GET as listAudit } from '@/app/api/audit/route'
import { GET as listShifts, POST as createShift } from '@/app/api/admin/driver-shifts/route'
import { GET as listDrivers, POST as createDriver } from '@/app/api/admin/drivers/route'
import { DELETE as deleteRoom, GET as getRoom } from '@/app/api/admin/rooms/[id]/route'
import { POST as createRoom } from '@/app/api/admin/rooms/route'
import { POST as createRoomType } from '@/app/api/admin/room-types/route'
import { POST as resetPassword } from '@/app/api/admin/users/[id]/reset-password/route'
import { PATCH as patchUser } from '@/app/api/admin/users/[id]/route'
import { GET as listUsers } from '@/app/api/admin/users/route'
import { GET as me } from '@/app/api/me/route'
import { eventTime } from '@/tests/support/event-dates'
import { type StaffMember, TestApp } from './support/test-app'

describe('edge cases', () => {
  let app: TestApp
  let admin: StaffMember
  let coordinator: StaffMember

  beforeAll(async () => {
    app = await TestApp.start()
    admin = await app.createStaff('admin')
    coordinator = await app.createStaff('coordinator', { name: 'Ada Coordinator' })
  })
  afterAll(async () => {
    await app.stop()
  })

  it('returns a null event context before the event is set up', async () => {
    const result = await app.call<{ event: unknown }>(me, '/api/me', { as: coordinator })
    expect(result.body.data.event).toBeNull()
  })

  it('asks for the event first when venue data is created too early', async () => {
    const result = await app.call(createRoomType, '/api/admin/room-types', {
      as: admin,
      body: { name: 'Suite', tier: 1, default_capacity: 2, cleaning_minutes: 45 },
    })
    expect(result.status).toBe(409)
    expect(result.body.error?.code).toBe('event_not_found')
  })

  describe('with an event', () => {
    beforeAll(async () => {
      await app.createEvent()
    })

    it('gets and deletes a room by id, with 404s for unknown ids', async () => {
      const type = await app.call<{ id: string }>(createRoomType, '/api/admin/room-types', {
        as: admin,
        body: { name: 'Suite', tier: 1, default_capacity: 2, cleaning_minutes: 45 },
      })
      const room = await app.call<{ id: string }>(createRoom, '/api/admin/rooms', {
        as: admin,
        body: { number: '701', floor: 7, wing: 'North', room_type_id: type.body.data.id, capacity: 3 },
      })
      const id = room.body.data.id

      const found = await app.call<{ capacity: number }>(getRoom, `/api/admin/rooms/${id}`, { as: coordinator, params: { id } })
      expect(found.body.data.capacity).toBe(3)

      const deleted = await app.call(deleteRoom, `/api/admin/rooms/${id}`, { as: admin, method: 'DELETE', params: { id } })
      expect(deleted.body.data).toEqual({ id, deleted: true })

      const missing = await app.call(getRoom, `/api/admin/rooms/${id}`, { as: coordinator, params: { id } })
      expect(missing.status).toBe(404)
      const deleteAgain = await app.call(deleteRoom, `/api/admin/rooms/${id}`, { as: admin, method: 'DELETE', params: { id } })
      expect(deleteAgain.status).toBe(404)

      const badId = await app.call(getRoom, '/api/admin/rooms/not-a-uuid', { as: coordinator, params: { id: 'not-a-uuid' } })
      expect(badId.status).toBe(400)
    })

    it('filters drivers by active state and shifts by driver', async () => {
      const active = await app.call<{ id: string }>(createDriver, '/api/admin/drivers', {
        as: admin,
        body: { full_name: 'Active Driver', vehicle_capacity: 4 },
      })
      await app.call(createDriver, '/api/admin/drivers', {
        as: admin,
        body: { full_name: 'Resting Driver', vehicle_capacity: 4, is_active: false },
      })
      await app.call(createShift, '/api/admin/driver-shifts', {
        as: admin,
        body: { driver_id: active.body.data.id, starts_at: eventTime(0, '06:00:00Z'), ends_at: eventTime(0, '10:00:00Z') },
      })

      const inactive = await app.call<Array<{ full_name: string }>>(listDrivers, '/api/admin/drivers?active=false', { as: coordinator })
      expect(inactive.body.data.map((driver) => driver.full_name)).toEqual(['Resting Driver'])

      const shifts = await app.call<unknown[]>(listShifts, `/api/admin/driver-shifts?driver_id=${active.body.data.id}`, { as: coordinator })
      expect(shifts.body.data).toHaveLength(1)
    })

    it('searches accounts, filters by active state and reactivates', async () => {
      const driver = await app.createStaff('driver', { name: 'Kemi Searchable' })
      await app.call(patchUser, `/api/admin/users/${driver.id}`, {
        as: admin,
        method: 'PATCH',
        params: { id: driver.id },
        body: { active: false },
      })

      const search = await app.call<Array<{ full_name: string }>>(listUsers, '/api/admin/users?search=searchable', { as: admin })
      expect(search.body.data.map((account) => account.full_name)).toEqual(['Kemi Searchable'])

      const inactive = await app.call<Array<{ id: string }>>(listUsers, '/api/admin/users?active=false', { as: admin })
      expect(inactive.body.data.map((account) => account.id)).toContain(driver.id)

      const reactivated = await app.call<{ active: boolean; deactivation_reason: string | null }>(patchUser, `/api/admin/users/${driver.id}`, {
        as: admin,
        method: 'PATCH',
        params: { id: driver.id },
        body: { active: true, role: 'accommodation', phone: null },
      })
      expect(reactivated.body.data).toMatchObject({ active: true, deactivation_reason: null, role: 'accommodation' })
    })

    it('stops an admin from assigning the admin role or resetting their own password', async () => {
      const driver = await app.createStaff('driver')
      const promote = await app.call(patchUser, `/api/admin/users/${driver.id}`, {
        as: admin,
        method: 'PATCH',
        params: { id: driver.id },
        body: { role: 'admin' },
      })
      expect(promote.status).toBe(403)

      const own = await app.call(resetPassword, `/api/admin/users/${admin.id}/reset-password`, { as: admin, params: { id: admin.id } })
      expect(own.status).toBe(409)
      expect(own.body.error?.code).toBe('use_password_change')
    })

    it('filters the activity log by entity type, actor and time window', async () => {
      const byActor = await app.call<Array<{ actor_id: string; entity_type: string }>>(
        listAudit,
        `/api/audit?entity_type=rooms&actor_id=${admin.id}&from=2020-01-01T00:00:00Z&to=2100-01-01T00:00:00Z`,
        { as: coordinator },
      )
      expect(byActor.status).toBe(200)
      expect(byActor.body.data.length).toBeGreaterThan(0)
      expect(byActor.body.data.every((entry) => entry.actor_id === admin.id && entry.entity_type === 'rooms')).toBe(true)

      const future = await app.call<unknown[]>(listAudit, '/api/audit?from=2100-01-01T00:00:00Z', { as: coordinator })
      expect(future.body.data).toEqual([])
    })
  })
})
