import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { POST as regenerateToken } from '@/app/api/admin/event/intake-token/route'
import { GET as getEvent, PATCH as patchEvent } from '@/app/api/admin/event/route'
import { POST as createEvent } from '@/app/api/events/route'
import { DELETE as deleteRoomType, PATCH as patchRoomType } from '@/app/api/admin/room-types/[id]/route'
import { GET as listRoomTypes, POST as createRoomType } from '@/app/api/admin/room-types/route'
import { PATCH as patchRoom } from '@/app/api/admin/rooms/[id]/route'
import { POST as importRooms } from '@/app/api/admin/rooms/import/route'
import { GET as listRooms, POST as createRoom } from '@/app/api/admin/rooms/route'
import { GET as listAudit } from '@/app/api/audit/route'
import { GET as me } from '@/app/api/me/route'
import { EVENT_DAY, EVENT_LAST_DAY } from '@/tests/support/event-dates'
import { type StaffMember, TestApp } from './support/test-app'

const EVENT = {
  name: 'Annual Summit',
  venue_name: 'Grand Hotel',
  timezone: 'Africa/Lagos',
  starts_on: EVENT_DAY,
  ends_on: EVENT_LAST_DAY,
  arrival_airports: ['los', 'ABV'],
}

describe('event, room types and rooms API', () => {
  let app: TestApp
  let superAdmin: StaffMember
  let manager: StaffMember
  let admin: StaffMember
  let coordinator: StaffMember
  let housekeeping: StaffMember
  let driver: StaffMember

  beforeAll(async () => {
    app = await TestApp.start()
    superAdmin = await app.createStaff('super_admin')
    manager = await app.createStaff('programme_manager')
    admin = await app.createStaff('admin')
    coordinator = await app.createStaff('coordinator')
    housekeeping = await app.createStaff('housekeeping')
    driver = await app.createStaff('driver')
  })
  afterAll(async () => {
    await app.stop()
  })

  describe('event settings', () => {
    it('lets a Programme Manager create the event, and not admins or coordinators (P9 step 9.4)', async () => {
      for (const blocked of [coordinator, admin]) {
        expect((await app.call(createEvent, '/api/events', { as: blocked, body: EVENT })).status).toBe(403)
      }

      const created = await app.call<{ arrival_airports: string[]; starts_on: string; intake_token: string; status: string }>(
        createEvent,
        '/api/events',
        { as: manager, body: EVENT },
      )
      expect(created.status).toBe(201)
      expect(created.body.data).toMatchObject({ arrival_airports: ['LOS', 'ABV'], starts_on: EVENT_DAY, status: 'draft' })
      expect(created.body.data.intake_token).toMatch(/^[0-9a-f]{32}$/)
    })

    it('validates settings and reserves the flight data mode for super admins', async () => {
      const badZone = await app.call(patchEvent, '/api/admin/event', { as: admin, method: 'PATCH', body: { timezone: 'Mars/Base' } })
      expect(badZone.status).toBe(400)

      const flightMode = await app.call(patchEvent, '/api/admin/event', { as: admin, method: 'PATCH', body: { flight_mode: 'live' } })
      expect(flightMode.status).toBe(403)

      const bySuper = await app.call<{ flight_mode: string }>(patchEvent, '/api/admin/event', {
        as: superAdmin,
        method: 'PATCH',
        body: { flight_mode: 'live', intake_open: true },
      })
      expect(bySuper.status).toBe(200)
      expect(bySuper.body.data.flight_mode).toBe('live')
    })

    it('regenerates the intake link token', async () => {
      const before = await app.call<{ intake_token: string }>(getEvent, '/api/admin/event', { as: coordinator })
      const result = await app.call<{ intake_token: string }>(regenerateToken, '/api/admin/event/intake-token', { as: admin })
      expect(result.status).toBe(200)
      expect(result.body.data.intake_token).not.toBe(before.body.data.intake_token)
    })

    it('gives every role the safe event context through /api/me', async () => {
      const result = await app.call<{ event: Record<string, unknown> }>(me, '/api/me', { as: driver })
      expect(result.body.data.event).toMatchObject({ timezone: 'Africa/Lagos', flight_mode: 'live' })
      expect(result.body.data.event).not.toHaveProperty('intake_token')
    })
  })

  describe('room types and rooms', () => {
    let suiteId: string

    beforeAll(async () => {
      const suite = await app.call<{ id: string }>(createRoomType, '/api/admin/room-types', {
        as: admin,
        body: { name: 'Deluxe Suite', tier: 1, default_capacity: 2, cleaning_minutes: 60 },
      })
      suiteId = suite.body.data.id
      await app.call(createRoomType, '/api/admin/room-types', {
        as: admin,
        body: { name: 'Standard', tier: 3, default_capacity: 1, cleaning_minutes: 30 },
      })
    })

    it('lists room types in tier order with pagination metadata', async () => {
      const result = await app.call<Array<{ name: string }>>(listRoomTypes, '/api/admin/room-types', { as: coordinator })
      expect(result.body.data.map((type) => type.name)).toEqual(['Deluxe Suite', 'Standard'])
      expect(result.body.meta).toEqual({ total: 2, page: 1, limit: 50 })
    })

    it("creates a room with the room type's default capacity", async () => {
      const result = await app.call<{ capacity: number }>(createRoom, '/api/admin/rooms', {
        as: admin,
        body: { number: '101', floor: 1, wing: 'East', room_type_id: suiteId },
      })
      expect(result.status).toBe(201)
      expect(result.body.data.capacity).toBe(2)
    })

    it('rejects unknown fields so clients cannot set protected columns', async () => {
      const result = await app.call(createRoom, '/api/admin/rooms', {
        as: admin,
        body: { number: '102', floor: 1, wing: 'East', room_type_id: suiteId, housekeeping_status: 'cleaning' },
      })
      expect(result.status).toBe(400)
    })

    it('lets housekeeping read rooms but not change them, and keeps drivers out', async () => {
      expect((await app.call(listRooms, '/api/admin/rooms', { as: housekeeping })).status).toBe(200)
      const write = await app.call(createRoom, '/api/admin/rooms', {
        as: housekeeping,
        body: { number: '103', floor: 1, wing: 'East', room_type_id: suiteId },
      })
      expect(write.status).toBe(403)
      expect((await app.call(listRooms, '/api/admin/rooms', { as: driver })).status).toBe(403)
    })

    it('refuses to delete a room type that rooms still use', async () => {
      const result = await app.call(deleteRoomType, `/api/admin/room-types/${suiteId}`, {
        as: admin,
        method: 'DELETE',
        params: { id: suiteId },
      })
      expect(result.status).toBe(409)
      expect(result.body.error?.code).toBe('in_use')
    })

    it('returns 404 when updating a room type that does not exist', async () => {
      const id = crypto.randomUUID()
      const result = await app.call(patchRoomType, `/api/admin/room-types/${id}`, {
        as: admin,
        method: 'PATCH',
        params: { id },
        body: { tier: 2 },
      })
      expect(result.status).toBe(404)
    })

    it('records room changes in the activity log with the acting admin', async () => {
      const rooms = await app.call<Array<{ id: string }>>(listRooms, '/api/admin/rooms?floor=1&wing=East', { as: admin })
      const roomId = rooms.body.data[0]?.id ?? ''
      await app.call(patchRoom, `/api/admin/rooms/${roomId}`, {
        as: admin,
        method: 'PATCH',
        params: { id: roomId },
        body: { notes: 'Balcony door sticks' },
      })

      const log = await app.call<Array<{ action: string; actor_name: string; undone: boolean }>>(
        listAudit,
        `/api/audit?entity_id=${roomId}`,
        { as: coordinator },
      )
      expect(log.status).toBe(200)
      expect(log.body.data[0]).toMatchObject({ action: 'rooms.update', actor_name: 'Test admin', undone: false })
    })
  })

  describe('room CSV import', () => {
    const HEADER = 'Number,Floor,Wing,Position,Room Type,Capacity,Accessible,Out of service,Notes'

    it('previews an import without writing anything', async () => {
      const csv = [HEADER, '201,2,West,1,Standard,,no,no,', '202,2,West,2,standard,1,yes,no,Near lift'].join('\n')
      const preview = await app.call<{ created: number; dry_run: boolean }>(importRooms, '/api/admin/rooms/import?dry_run=true', {
        as: admin,
        rawBody: csv,
        contentType: 'text/csv',
      })
      expect(preview.status).toBe(200)
      expect(preview.body.data).toEqual({ rows: 2, created: 2, updated: 0, dry_run: true })
      const [count] = await app.sql<{ n: number }>(`select count(*)::int as n from rooms where wing = 'West'`)
      expect(count?.n).toBe(0)
    })

    it('creates new rooms and updates existing ones by number', async () => {
      const csv = [HEADER, '101,1,East,4,Deluxe Suite,2,no,no,Renovated', '201,2,West,1,Standard,,no,no,'].join('\n')
      const result = await app.call<{ created: number; updated: number }>(importRooms, '/api/admin/rooms/import', {
        as: admin,
        rawBody: csv,
        contentType: 'text/csv',
      })
      expect(result.status).toBe(201)
      expect(result.body.data).toMatchObject({ created: 1, updated: 1 })
      const [room] = await app.sql<{ notes: string; position: number }>(`select notes, position from rooms where number = '101'`)
      expect(room).toEqual({ notes: 'Renovated', position: 4 })
    })

    it('imports nothing when any line is invalid, and says which lines', async () => {
      const csv = [HEADER, '301,3,North,1,Standard,2,no,no,', '302,three,North,2,Penthouse,2,no,no,'].join('\n')
      const result = await app.call(importRooms, '/api/admin/rooms/import', { as: admin, rawBody: csv, contentType: 'text/csv' })
      expect(result.status).toBe(400)
      expect(result.body.error?.code).toBe('import_invalid')
      expect(result.body.error?.details).toEqual({ errors: [expect.objectContaining({ line: 3 })] })
      const [count] = await app.sql<{ n: number }>(`select count(*)::int as n from rooms where wing = 'North'`)
      expect(count?.n).toBe(0)
    })

    it('rejects unknown room types and non-CSV uploads', async () => {
      const unknownType = await app.call(importRooms, '/api/admin/rooms/import', {
        as: admin,
        rawBody: [HEADER, '401,4,South,1,Penthouse,2,no,no,'].join('\n'),
        contentType: 'text/csv',
      })
      expect(unknownType.status).toBe(400)

      const wrongType = await app.call(importRooms, '/api/admin/rooms/import', { as: admin, body: { csv: HEADER } })
      expect(wrongType.status).toBe(415)
    })
  })
})
