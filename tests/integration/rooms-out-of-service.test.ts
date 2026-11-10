import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PATCH as patchRoom } from '@/app/api/admin/rooms/[id]/route'
import { POST as importRooms } from '@/app/api/admin/rooms/import/route'
import { POST as checkIn } from '@/app/api/front-desk/[id]/check-in/route'
import { POST as assign } from '@/app/api/room-assignments/route'
import { GET as simulationOptions } from '@/app/api/simulation/options/route'
import { POST as whatIf } from '@/app/api/simulation/what-if/route'
import type { WhatIfResult } from '@/lib/services/simulation/what-if'
import { EVENT_DAY, type Party, type Venue, addParty, addVenue } from './support/rooms-fixture'
import { type StaffMember, TestApp } from './support/test-app'

// Lets a test make the re-planning fail, to check that the failure is never silent.
const failure = vi.hoisted(() => ({ rework: false }))
vi.mock('@/lib/services/rooms/suggest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/rooms/suggest')>()
  return {
    ...actual,
    reworkRoom: (...args: Parameters<typeof actual.reworkRoom>) => (failure.rework ? Promise.reject(new Error('Injected re-planning failure')) : actual.reworkRoom(...args)),
  }
})

vi.stubEnv('DATABASE_URL', 'pglite://memory')
vi.stubEnv('SERVICE_DATABASE_URL', 'pglite://memory')
vi.stubEnv('BETTER_AUTH_SECRET', 'integration-test-secret-'.padEnd(48, 'x'))
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')

describe('a room going out of service', () => {
  let app: TestApp
  let admin: StaffMember
  let coordinator: StaffMember
  let frontDesk: StaffMember
  let venue: Venue
  let okafor: Party
  let eze: Party

  beforeAll(async () => {
    app = await TestApp.start()
    await app.createEvent()
    admin = await app.createStaff('admin', { name: 'Ada Admin' })
    coordinator = await app.createStaff('coordinator')
    frontDesk = await app.createStaff('accommodation')
    venue = await addVenue(app)
    okafor = await addParty(app, { name: 'Augustine Okafor', category_id: null, arrival_at: `${EVENT_DAY}T14:00:00Z` })
    eze = await addParty(app, { name: 'Ngozi Eze', category_id: null, arrival_at: `${EVENT_DAY}T16:00:00Z` })
    for (const [guest, number] of [[okafor.principal_id, '301'], [eze.principal_id, '101']] as const) {
      const placed = await app.call(assign, '/api/room-assignments', { as: coordinator, body: { guest_id: guest, room_id: venue.rooms.get(number) } })
      expect(placed.status).toBe(201)
    }
  })
  afterAll(async () => {
    await app.stop()
  })

  const room = (number: string) => venue.rooms.get(number) ?? ''
  const patch = (staff: StaffMember, number: string, body: unknown) =>
    app.call<{ id: string; out_of_service: boolean }>(patchRoom, `/api/admin/rooms/${room(number)}`, { as: staff, method: 'PATCH', params: { id: room(number) }, body })
  const preview = (number: string) => app.call<WhatIfResult>(whatIf, '/api/simulation/what-if', { as: coordinator, body: { kind: 'room_out_of_service', room_id: room(number) } })
  const counts = async () =>
    (
      await app.sql<{ proposals: number; notifications: number; rooms_out: number }>(
        `select (select count(*)::int from proposals) as proposals, (select count(*)::int from notifications) as notifications,
           (select count(*)::int from rooms where out_of_service) as rooms_out`,
      )
    )[0]

  describe('what-if preview', () => {
    it('offers the rooms with guests in them', async () => {
      const options = await app.call<{ rooms: { id: string; number: string; guests: string[] }[] }>(simulationOptions, '/api/simulation/options', { as: coordinator })

      expect(options.body.data.rooms).toEqual([
        { id: room('101'), number: '101', guests: ['Ngozi Eze'] },
        { id: room('301'), number: '301', guests: ['Augustine Okafor'] },
      ])
    })

    it('shows the move that would be proposed, and writes nothing', async () => {
      const before = await counts()

      const result = await preview('301')

      expect(result.status).toBe(200)
      expect(result.body.data).toMatchObject({ headline: 'Room 301 out of service: 1 guest affected, 1 decision', decisions: 1 })
      expect(result.body.data.lines).toEqual([
        { kind: 'proposal', title: expect.stringMatching(/^Move Augustine Okafor from room 301 to \d+$/), detail: expect.stringContaining('The room is out of service.') },
      ])
      expect(await counts()).toEqual(before)
    })

    it('says when nobody is affected, and refuses an unknown room', async () => {
      const empty = await preview('206')
      expect(empty.body.data).toMatchObject({ headline: 'Room 206 out of service: no guests affected', decisions: 0, lines: [] })

      const unknown = await app.call(whatIf, '/api/simulation/what-if', { as: coordinator, body: { kind: 'room_out_of_service', room_id: '00000000-0000-4000-8000-000000000000' } })
      expect(unknown.status).toBe(404)
    })
  })

  describe('Settings → Rooms', () => {
    it('proposes a move for the planned stay when an admin takes its room out of service, as the admin', async () => {
      const [stay] = await app.sql<{ id: string }>(`select id from room_assignments where guest_id = $1 and status = 'planned'`, [okafor.principal_id])

      const saved = await patch(admin, '301', { out_of_service: true, notes: 'Leak in the ceiling' })

      expect(saved.status).toBe(200)
      expect(saved.body.data).toMatchObject({ id: room('301'), out_of_service: true })
      const proposals = await app.sql<{ title: string; replaces: string; trigger_type: string; trigger_id: string }>(
        `select title, payload ->> 'replaces' as replaces, trigger_type, trigger_id::text from proposals where status = 'pending' and target_id = $1`,
        [okafor.principal_id],
      )
      expect(proposals).toEqual([{ title: expect.stringMatching(/^Move Augustine Okafor from room 301 to /), replaces: stay?.id, trigger_type: 'room', trigger_id: room('301') }])
      // The re-plan runs as the system, recorded as the admin's doing.
      const audit = await app.sql<{ actor_id: string }>(`select actor_id from audit_log where entity_type = 'proposals' and action = 'proposals.create' and entity_id = (select id from proposals where status = 'pending' and target_id = $1)`, [okafor.principal_id])
      expect(audit).toEqual([{ actor_id: admin.id }])
    })

    it('changes nothing else when the room is empty, already out of service, or edited otherwise', async () => {
      const before = await counts()

      expect((await patch(admin, '206', { out_of_service: true })).status).toBe(200)
      expect((await patch(admin, '301', { out_of_service: true })).status).toBe(200)
      expect((await patch(admin, '205', { notes: 'Fresh paint' })).status).toBe(200)

      const after = await counts()
      expect(after).toEqual({ ...before, rooms_out: (before?.rooms_out ?? 0) + 1 })
    })

    it('alerts the coordinators when the guest has already checked in', async () => {
      expect((await app.call(checkIn, '/api/front-desk/x/check-in', { as: frontDesk, params: { id: eze.delegation_id }, body: {} })).status).toBe(200)

      expect((await patch(admin, '101', { out_of_service: true })).status).toBe(200)

      const alerts = await app.sql<{ title: string }>(`select distinct title from notifications where kind = 'room_alert' and entity_id = $1`, [eze.principal_id])
      expect(alerts).toEqual([{ title: 'Ngozi Eze is checked in to room 101, which can no longer be used' }])
    })

    it('alerts the coordinators when the stays cannot be re-planned, and still saves the room', async () => {
      const party = await addParty(app, { name: 'Kwame Asante', category_id: null })
      expect((await app.call(assign, '/api/room-assignments', { as: coordinator, body: { guest_id: party.principal_id, room_id: room('104') } })).status).toBe(201)

      failure.rework = true
      const saved = await patch(admin, '104', { out_of_service: true }).finally(() => {
        failure.rework = false
      })

      expect(saved.status).toBe(200)
      expect(saved.body.data.out_of_service).toBe(true)
      expect(await app.sql(`select id from proposals where target_id = $1`, [party.principal_id])).toEqual([])
      const alerts = await app.sql<{ title: string; priority: string; entity_type: string }>(
        `select distinct title, priority, entity_type from notifications where kind = 'room_alert' and entity_id = $1`,
        [room('104')],
      )
      expect(alerts).toEqual([{ title: 'Room 104 was taken out of service but its stays could not be re-planned — check Rooms', priority: 'high', entity_type: 'rooms' }])
    })

    it('re-plans once when two saves take the same room out of service at the same time', async () => {
      const party = await addParty(app, { name: 'Lindiwe Dube', category_id: null })
      expect((await app.call(assign, '/api/room-assignments', { as: coordinator, body: { guest_id: party.principal_id, room_id: room('105') } })).status).toBe(201)

      const saves = await Promise.all([patch(admin, '105', { out_of_service: true }), patch(admin, '105', { out_of_service: true, notes: 'Burst pipe' })])

      expect(saves.map((save) => save.status)).toEqual([200, 200])
      const proposals = await app.sql<{ status: string }>(`select status from proposals where target_id = $1`, [party.principal_id])
      expect(proposals).toEqual([{ status: 'pending' }])
    })

    it('still keeps room edits to admins', async () => {
      expect((await patch(coordinator, '102', { out_of_service: true })).status).toBe(403)
      expect((await patch(frontDesk, '102', { out_of_service: true })).status).toBe(403)
      expect((await patch(admin, '102', { out_of_service: 'yes' })).status).toBe(400)
    })
  })

  describe('room CSV import', () => {
    const HEADER = 'Number,Floor,Wing,Position,Room Type,Capacity,Accessible,Out of service,Notes'
    // 302 holds a planned stay and goes out of service; 303 is empty; 101 is already out of service.
    const CSV = [HEADER, '303,3,West,3,Suite,2,no,yes,Repainting', '101,1,West,1,Standard,2,yes,yes,', '302,3,West,2,Suite,2,no,yes,Leak'].join('\n')
    let late: Party

    const upload = (dryRun: boolean) =>
      app.call<{ rows: number; created: number; updated: number; dry_run: boolean }>(importRooms, `/api/admin/rooms/import${dryRun ? '?dry_run=true' : ''}`, {
        as: admin,
        rawBody: CSV,
        contentType: 'text/csv',
      })
    const pendingFor = (guestId: string) =>
      app.sql<{ title: string; replaces: string; trigger_type: string; trigger_id: string }>(
        `select title, payload ->> 'replaces' as replaces, trigger_type, trigger_id::text from proposals where status = 'pending' and target_id = $1`,
        [guestId],
      )

    beforeAll(async () => {
      late = await addParty(app, { name: 'Tendai Moyo', category_id: null, arrival_at: `${EVENT_DAY}T18:00:00Z` })
      expect((await app.call(assign, '/api/room-assignments', { as: coordinator, body: { guest_id: late.principal_id, room_id: room('302') } })).status).toBe(201)
    })

    it('previews the import without writing or proposing anything', async () => {
      const before = await counts()

      const preview = await upload(true)

      expect(preview.status).toBe(200)
      expect(preview.body.data).toEqual({ rows: 3, created: 0, updated: 3, dry_run: true })
      expect(await counts()).toEqual(before)
      expect(await pendingFor(late.principal_id)).toEqual([])
    })

    it('re-plans the stays of every room the import takes out of service, as the admin, and nothing else', async () => {
      const before = await counts()
      const [stay] = await app.sql<{ id: string }>(`select id from room_assignments where guest_id = $1 and status = 'planned'`, [late.principal_id])
      const ezeAlerts = await app.sql(`select id from notifications where kind = 'room_alert' and entity_id = $1`, [eze.principal_id])

      const result = await upload(false)

      expect(result.status).toBe(201)
      expect(result.body.data).toEqual({ rows: 3, created: 0, updated: 3, dry_run: false })
      expect(await pendingFor(late.principal_id)).toEqual([
        { title: expect.stringMatching(/^Move Tendai Moyo from room 302 to /), replaces: stay?.id, trigger_type: 'room', trigger_id: room('302') },
      ])
      const after = await counts()
      expect(after?.proposals).toBe((before?.proposals ?? 0) + 1)
      expect(after?.rooms_out).toBe((before?.rooms_out ?? 0) + 2)
      // Room 101 was already out of service: its checked-in guest is not alerted again.
      expect(await app.sql(`select id from notifications where kind = 'room_alert' and entity_id = $1`, [eze.principal_id])).toHaveLength(ezeAlerts.length)
      const audit = await app.sql<{ actor_id: string }>(
        `select actor_id from audit_log where entity_type = 'proposals' and action = 'proposals.create' and entity_id = (select id from proposals where status = 'pending' and target_id = $1)`,
        [late.principal_id],
      )
      expect(audit).toEqual([{ actor_id: admin.id }])
    })

    it('does nothing more when the same file is imported again', async () => {
      const before = await counts()

      expect((await upload(false)).status).toBe(201)

      expect(await counts()).toEqual(before)
    })
  })
})
