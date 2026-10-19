import { describe, expect, it } from 'vitest'
import { useTestDb } from './support/use-test-db'

describe('rooms and room types', () => {
  const db = useTestDb()

  it('lets admins create rooms and blocks coordinators from writing', async () => {
    await db().createEvent()
    const roomType = await db().createRoomType()
    const admin = await db().createProfile('admin')
    const coordinator = await db().createProfile('coordinator')

    await db().asUser(coordinator)
    const blocked = await db().expectError(() =>
      db().rows(`insert into rooms (number, floor, wing, room_type_id) values ('101', 1, 'East', $1)`, [roomType]),
    )
    expect(blocked.code).toBe('42501')

    await db().asUser(admin)
    const created = await db().rows(
      `insert into rooms (number, floor, wing, room_type_id) values ('101', 1, 'East', $1) returning number`,
      [roomType],
    )
    expect(created).toEqual([{ number: '101' }])
  })

  it('shows rooms to accommodation and housekeeping but not to drivers', async () => {
    await db().createEvent()
    await db().createRoom(await db().createRoomType())
    const counts: Record<string, number> = {}
    for (const role of ['accommodation', 'housekeeping', 'driver', 'programs'] as const) {
      await db().asOwner()
      const user = await db().createProfile(role)
      await db().asUser(user)
      counts[role] = await db().value<number>('select count(*)::int from rooms')
    }
    expect(counts).toEqual({ accommodation: 1, housekeeping: 1, driver: 0, programs: 0 })
  })

  it("defaults a room's capacity to its room type's default", async () => {
    await db().createEvent()
    const roomType = await db().createRoomType({ default_capacity: 3 })
    const room = await db().createRoom(roomType)
    expect(await db().value('select capacity from rooms where id = $1', [room])).toBe(3)
  })

  it('refuses to delete a room type that rooms still use', async () => {
    await db().createEvent()
    const roomType = await db().createRoomType()
    await db().createRoom(roomType)
    const error = await db().expectError(() => db().rows('delete from room_types where id = $1', [roomType]))
    expect(error.code).toBe('23503')
  })

  it('needs an event to exist before venue data is added', async () => {
    const error = await db().expectError(() => db().createRoomType())
    expect(error.code).toBe('23502')
  })
})

describe('VIP categories', () => {
  const db = useTestDb()

  it('lets coordinators edit and the programs team only read', async () => {
    await db().createEvent()
    const coordinator = await db().createProfile('coordinator')
    const programs = await db().createProfile('programs')

    await db().asUser(coordinator)
    await db().rows(`insert into vip_categories (name, rank) values ('Minister', 1)`)

    await db().asUser(programs)
    expect(await db().value<number>('select count(*)::int from vip_categories')).toBe(1)
    const blocked = await db().expectError(() =>
      db().rows(`insert into vip_categories (name, rank) values ('Clergy', 2)`),
    )
    expect(blocked.code).toBe('42501')
  })

  it('reorders ranks in one step, swapping without a uniqueness clash', async () => {
    await db().createEvent()
    const minister = await db().createVipCategory('Minister', 1)
    const clergy = await db().createVipCategory('Clergy', 2)
    const coordinator = await db().createProfile('coordinator')
    await db().asUser(coordinator)

    await db().rows('select public.reorder_vip_categories($1::uuid[])', [[clergy, minister]])
    const ranks = await db().rows('select name, rank from vip_categories order by rank')
    expect(ranks).toEqual([
      { name: 'Clergy', rank: 1 },
      { name: 'Minister', rank: 2 },
    ])
  })

  it('rejects a reorder that leaves a category out', async () => {
    await db().createEvent()
    const minister = await db().createVipCategory('Minister', 1)
    await db().createVipCategory('Clergy', 2)
    const coordinator = await db().createProfile('coordinator')
    await db().asUser(coordinator)

    const error = await db().expectError(() =>
      db().rows('select public.reorder_vip_categories($1::uuid[])', [[minister]]),
    )
    expect(error.hint).toBe('invalid_order')
  })
})

describe('drivers and shifts', () => {
  const db = useTestDb()

  it('shows a driver only their own record and shifts', async () => {
    await db().createEvent()
    const driverLogin = await db().createProfile('driver')
    const mine = await db().createDriver({ profile_id: driverLogin })
    const theirs = await db().createDriver()
    await db().rows(
      `insert into driver_shifts (driver_id, starts_at, ends_at) values
        ($1, '2026-11-20 06:00Z', '2026-11-20 14:00Z'),
        ($2, '2026-11-20 06:00Z', '2026-11-20 14:00Z')`,
      [mine, theirs],
    )
    await db().asUser(driverLogin)

    const drivers = await db().rows<{ id: string }>('select id from drivers')
    const shifts = await db().rows<{ driver_id: string }>('select driver_id from driver_shifts')
    expect(drivers.map((row) => row.id)).toEqual([mine])
    expect(shifts.map((row) => row.driver_id)).toEqual([mine])
  })

  it('rejects overlapping shifts for the same driver', async () => {
    await db().createEvent()
    const driver = await db().createDriver()
    await db().rows(
      `insert into driver_shifts (driver_id, starts_at, ends_at) values ($1, '2026-11-20 06:00Z', '2026-11-20 14:00Z')`,
      [driver],
    )
    const error = await db().expectError(() =>
      db().rows(
        `insert into driver_shifts (driver_id, starts_at, ends_at) values ($1, '2026-11-20 13:00Z', '2026-11-20 20:00Z')`,
        [driver],
      ),
    )
    expect(error.code).toBe('23P01')
  })

  it('rejects shifts longer than 24 hours', async () => {
    await db().createEvent()
    const driver = await db().createDriver()
    const error = await db().expectError(() =>
      db().rows(
        `insert into driver_shifts (driver_id, starts_at, ends_at) values ($1, '2026-11-20 06:00Z', '2026-11-21 07:00Z')`,
        [driver],
      ),
    )
    expect(error.code).toBe('23514')
  })

  it('only links logins that have the driver role', async () => {
    await db().createEvent()
    const coordinator = await db().createProfile('coordinator')
    const error = await db().expectError(() => db().createDriver({ profile_id: coordinator }))
    expect(error.hint).toBe('driver_profile_role')
  })
})
