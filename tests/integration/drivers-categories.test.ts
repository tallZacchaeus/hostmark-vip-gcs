import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { POST as createShift, GET as listShifts } from '@/app/api/admin/driver-shifts/route'
import { GET as listDrivers, POST as createDriver } from '@/app/api/admin/drivers/route'
import { POST as reorder } from '@/app/api/admin/vip-categories/reorder/route'
import { GET as listCategories, POST as createCategory } from '@/app/api/admin/vip-categories/route'
import { eventTime } from '@/tests/support/event-dates'
import { type StaffMember, TestApp } from './support/test-app'

describe('drivers, shifts and VIP categories API', () => {
  let app: TestApp
  let admin: StaffMember
  let coordinator: StaffMember
  let programs: StaffMember
  let driverLogin: StaffMember
  let ownDriverId: string

  beforeAll(async () => {
    app = await TestApp.start()
    await app.createEvent()
    admin = await app.createStaff('admin')
    coordinator = await app.createStaff('coordinator')
    programs = await app.createStaff('programs')
    driverLogin = await app.createStaff('driver')

    const own = await app.call<{ id: string }>(createDriver, '/api/admin/drivers', {
      as: admin,
      body: { full_name: 'Emeka Obi', vehicle_capacity: 4, vehicle_label: 'Hiace 2', profile_id: driverLogin.id },
    })
    ownDriverId = own.body.data.id
    await app.call(createDriver, '/api/admin/drivers', { as: admin, body: { full_name: 'Other Driver', vehicle_capacity: 7 } })
  })
  afterAll(async () => {
    await app.stop()
  })

  it('shows coordinators every driver and a driver only themselves', async () => {
    const all = await app.call<unknown[]>(listDrivers, '/api/admin/drivers', { as: coordinator })
    expect(all.body.data).toHaveLength(2)

    const own = await app.call<Array<{ id: string }>>(listDrivers, '/api/admin/drivers', { as: driverLogin })
    expect(own.body.data.map((driver) => driver.id)).toEqual([ownDriverId])
  })

  it('only links logins that have the driver role', async () => {
    const result = await app.call(createDriver, '/api/admin/drivers', {
      as: admin,
      body: { full_name: 'Wrong Link', vehicle_capacity: 4, profile_id: coordinator.id },
    })
    expect(result.status).toBe(400)
    expect(result.body.error?.code).toBe('driver_profile_role')
  })

  it('rejects overlapping and over-long shifts', async () => {
    const first = await app.call(createShift, '/api/admin/driver-shifts', {
      as: admin,
      body: { driver_id: ownDriverId, starts_at: eventTime(0, '06:00:00Z'), ends_at: eventTime(0, '14:00:00Z') },
    })
    expect(first.status).toBe(201)

    const overlap = await app.call(createShift, '/api/admin/driver-shifts', {
      as: admin,
      body: { driver_id: ownDriverId, starts_at: eventTime(0, '13:00:00Z'), ends_at: eventTime(0, '20:00:00Z') },
    })
    expect(overlap.status).toBe(409)
    expect(overlap.body.error?.code).toBe('overlap')

    const tooLong = await app.call(createShift, '/api/admin/driver-shifts', {
      as: admin,
      body: { driver_id: ownDriverId, starts_at: eventTime(1, '06:00:00Z'), ends_at: eventTime(2, '07:00:00Z') },
    })
    expect(tooLong.status).toBe(400)
  })

  it('filters shifts by an overlap window', async () => {
    const inWindow = await app.call<unknown[]>(
      listShifts,
      `/api/admin/driver-shifts?from=${eventTime(0, '12:00:00Z')}&to=${eventTime(0, '13:00:00Z')}`,
      { as: coordinator },
    )
    expect(inWindow.body.data).toHaveLength(1)
    const outside = await app.call<unknown[]>(
      listShifts,
      `/api/admin/driver-shifts?from=${eventTime(1, '00:00:00Z')}&to=${eventTime(2, '00:00:00Z')}`,
      { as: coordinator },
    )
    expect(outside.body.data).toHaveLength(0)
  })

  it('lets coordinators manage VIP categories and the programs team only read them', async () => {
    const minister = await app.call<{ id: string }>(createCategory, '/api/admin/vip-categories', {
      as: coordinator,
      body: { name: 'Minister', rank: 1, preferred_room_tier: 1 },
    })
    const clergy = await app.call<{ id: string }>(createCategory, '/api/admin/vip-categories', {
      as: coordinator,
      body: { name: 'Clergy', rank: 2 },
    })
    expect(minister.status).toBe(201)

    const blocked = await app.call(createCategory, '/api/admin/vip-categories', { as: programs, body: { name: 'Artist', rank: 3 } })
    expect(blocked.status).toBe(403)

    const sameRank = await app.call(createCategory, '/api/admin/vip-categories', { as: coordinator, body: { name: 'Executive', rank: 2 } })
    expect(sameRank.status).toBe(409)

    const reordered = await app.call<Array<{ name: string; rank: number }>>(reorder, '/api/admin/vip-categories/reorder', {
      as: coordinator,
      body: { ids: [clergy.body.data.id, minister.body.data.id] },
    })
    expect(reordered.body.data.map(({ name, rank }) => ({ name, rank }))).toEqual([
      { name: 'Clergy', rank: 1 },
      { name: 'Minister', rank: 2 },
    ])

    const read = await app.call<unknown[]>(listCategories, '/api/admin/vip-categories', { as: programs })
    expect(read.body.data).toHaveLength(2)
  })
})
