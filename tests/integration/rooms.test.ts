import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { GET as plans } from '@/app/api/allocation/plans/[id]/route'
import { POST as runAllocator } from '@/app/api/allocation/run/route'
import { POST as checkIn } from '@/app/api/front-desk/[id]/check-in/route'
import { POST as undoCheckIn } from '@/app/api/front-desk/[id]/undo-check-in/route'
import { GET as frontDesk } from '@/app/api/front-desk/route'
import { GET as listGuests } from '@/app/api/guests/route'
import { POST as approve } from '@/app/api/proposals/[id]/approve/route'
import { POST as checkMoveRoute } from '@/app/api/room-assignments/check/route'
import { POST as assign } from '@/app/api/room-assignments/route'
import { GET as board } from '@/app/api/rooms/board/route'
import { getSystemDb, withSystem } from '@/lib/db/system'
import type { FrontDesk } from '@/lib/repositories/front-desk'
import type { DelegationRow } from '@/lib/repositories/guests'
import type { PlanView } from '@/lib/repositories/room-plan'
import type { RoomsBoard } from '@/lib/repositories/rooms-board'
import type { MoveCheck } from '@/lib/services/rooms/check'
import { reworkStays, suggestRoomsForNewGuests } from '@/lib/services/rooms/suggest'
import { EVENT_DAY, type Party, type Venue, addCategory, addParty, addVenue } from './support/rooms-fixture'
import { type StaffMember, TestApp } from './support/test-app'

vi.stubEnv('DATABASE_URL', 'pglite://memory')
vi.stubEnv('SERVICE_DATABASE_URL', 'pglite://memory')
vi.stubEnv('BETTER_AUTH_SECRET', 'integration-test-secret-'.padEnd(48, 'x'))
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')

describe('rooms: allocation, manual moves and the front desk', () => {
  let app: TestApp
  let coordinator: StaffMember
  let frontDeskStaff: StaffMember
  let venue: Venue
  let okafor: Party
  let eze: Party
  let planId: string
  let plan: PlanView

  beforeAll(async () => {
    app = await TestApp.start()
    await app.createEvent()
    coordinator = await app.createStaff('coordinator')
    frontDeskStaff = await app.createStaff('accommodation', { name: 'Tolu Front' })
    venue = await addVenue(app)
    okafor = await addParty(app, { name: 'Augustine Okafor', category_id: await addCategory(app, 'Cat. 1', 1), members: 2 })
    eze = await addParty(app, { name: 'Ngozi Eze', category_id: await addCategory(app, 'Cat. 2', 2), accessibility: 'Uses a wheelchair' })
  })
  afterAll(async () => {
    await app.stop()
  })

  const as = (staff: StaffMember) => ({ as: staff })
  const roomOf = async (guestId: string) =>
    (await app.sql<{ number: string; status: string }>(`select r.number, a.status from room_assignments a join rooms r on r.id = a.room_id where a.guest_id = $1 and a.status in ('planned', 'checked_in')`, [guestId]))[0]
  /** The codes the warning dialog would show for this move (what "assign anyway" acknowledges). */
  const warningsFor = async (guestId: string, roomId: string) => {
    const check = await app.call<MoveCheck>(checkMoveRoute, '/api/room-assignments/check', { ...as(coordinator), body: { guest_id: guestId, room_id: roomId } })
    return [...check.body.data.violations, ...check.body.data.losses].map((item) => item.code)
  }
  const freeRoom = async () =>
    (await app.sql<{ id: string; number: string }>(
      `select r.id, r.number from rooms r where r.housekeeping_status = 'clean' and not r.out_of_service
         and not exists (select 1 from room_assignments a where a.room_id = r.id and a.status in ('planned', 'checked_in'))
       order by r.number limit 1`,
    ))[0]

  it('runs the allocator into a plan to review; nothing is assigned yet', async () => {
    const run = await app.call<{ proposal_id: string; placed: number; unplaced: number }>(runAllocator, '/api/allocation/run', { ...as(coordinator), body: {} })

    expect(run.status).toBe(201)
    expect(run.body.data).toMatchObject({ placed: 4, unplaced: 0 })
    planId = run.body.data.proposal_id
    plan = (await app.call<PlanView>(plans, `/api/allocation/plans/${planId}`, { ...as(coordinator), params: { id: planId } })).body.data
    const line = (guestId: string) => plan.lines.find((item) => item.guest.id === guestId)
    expect(line(okafor.principal_id)).toMatchObject({ room: { floor: 3, type: 'Suite' }, why: expect.any(String), match: 'High' })
    expect(line(okafor.principal_id)?.preferences).toContainEqual({ code: 'tier', status: 'met', text: 'Tier match' })
    expect(line(eze.principal_id)?.room.number).toBe('101')
    expect(await app.sql('select * from room_assignments')).toHaveLength(0)
    const rooms = await app.call<RoomsBoard>(board, '/api/rooms/board', as(coordinator))
    expect(rooms.body.data.pending_plan_id).toBe(planId)
    expect(rooms.body.data.counts.proposed).toBeGreaterThanOrEqual(3)
  })

  it('approves the chosen lines and rejects the rest', async () => {
    const chosen = plan.lines.filter((line) => line.guest.id !== eze.principal_id).map((line) => line.id)

    const result = await app.call<{ status: string; applied: number; failed: number }>(approve, `/api/proposals/${planId}/approve`, { ...as(coordinator), params: { id: planId }, body: { line_ids: chosen } })

    expect(result.body.data).toMatchObject({ status: 'approved', applied: 3, failed: 0 })
    expect(await roomOf(okafor.principal_id)).toMatchObject({ status: 'planned' })
    expect(await roomOf(eze.principal_id)).toBeUndefined()
    const [ezeLine] = await app.sql<{ status: string }>(`select status from proposals where parent_id = $1 and target_id = $2`, [planId, eze.principal_id])
    expect(ezeLine?.status).toBe('rejected')

    // The guest list shows the party's room, the principal's first.
    const list = await app.call<{ rows: DelegationRow[] }>(listGuests, '/api/guests?tab=all', as(coordinator))
    const row = (id: string) => list.body.data.rows.find((item) => item.delegation_id === id)
    expect(row(okafor.delegation_id)).toMatchObject({ room_number: (await roomOf(okafor.principal_id))?.number, rooms_placed: 3, room_checked_in: false })
    expect(row(eze.delegation_id)).toMatchObject({ room_number: null, rooms_placed: 0 })
  })

  it('proposes a room on its own for a guest still without one, once', async () => {
    const run = () => withSystem(getSystemDb(), { actor: 'system' }, (tx) => suggestRoomsForNewGuests(tx, new Date(`${EVENT_DAY}T06:00:00Z`)))

    expect(await run()).toBe(1)
    const [single] = await app.sql<{ kind: string; parent_id: string | null; room: string }>(
      `select kind, parent_id, payload ->> 'room_id' as room from proposals where status = 'pending' and target_id = $1`,
      [eze.principal_id],
    )
    expect(single).toMatchObject({ kind: 'room_assignment', parent_id: null, room: venue.rooms.get('101') })
    expect(await run()).toBe(0)
  })

  it('warns before a move that breaks a rule or loses a preference, and keeps the reason', async () => {
    const aide = okafor.member_ids[0] ?? ''
    const principalRoom = (await roomOf(okafor.principal_id))?.number ?? ''
    const body = { guest_id: aide, room_id: venue.rooms.get(principalRoom) }

    const check = await app.call<MoveCheck>(checkMoveRoute, '/api/room-assignments/check', { ...as(coordinator), body })
    expect(check.body.data.violations.map((violation) => violation.code)).toEqual(['occupied'])
    const refused = await app.call(assign, '/api/room-assignments', { ...as(coordinator), body })
    expect(refused.status).toBe(409)
    expect(refused.body.error?.code).toBe('needs_confirmation')

    const far = await app.call<MoveCheck>(checkMoveRoute, '/api/room-assignments/check', { ...as(coordinator), body: { guest_id: aide, room_id: venue.rooms.get('106') } })
    expect(far.body.data).toMatchObject({ violations: [], needs_confirmation: true })
    expect(far.body.data.losses.map((loss) => loss.code)).toEqual(['proximity'])

    // A reason alone is not enough: every warning shown must be acknowledged, with a real reason.
    const unacknowledged = await app.call(assign, '/api/room-assignments', { ...as(coordinator), body: { ...body, reason: 'The bishop asked for his aide to share' } })
    expect(unacknowledged.body.error?.code).toBe('needs_confirmation')
    const terse = await app.call(assign, '/api/room-assignments', { ...as(coordinator), body: { ...body, reason: 'ok', acknowledged: ['occupied'] } })
    expect(terse.body.error?.code).toBe('needs_confirmation')
    const acknowledged = await warningsFor(body.guest_id, body.room_id ?? '')
    const moved = await app.call(assign, '/api/room-assignments', { ...as(coordinator), body: { ...body, reason: 'The bishop asked for his aide to share', acknowledged } })
    expect(moved.status).toBe(201)
    const [stay] = await app.sql<{ is_manual_override: boolean; override_reason: string; acknowledged_violations: string[] }>(
      `select is_manual_override, override_reason, acknowledged_violations from room_assignments where guest_id = $1 and status = 'planned'`,
      [aide],
    )
    expect(stay).toEqual({ is_manual_override: true, override_reason: 'The bishop asked for his aide to share', acknowledged_violations: ['occupied'] })
    const audit = await app.sql<{ actor_id: string; reason: string }>(`select actor_id, reason from audit_log where action = 'rooms.assign' and entity_type = 'room_assignments'`)
    expect(audit).toContainEqual({ actor_id: coordinator.id, reason: 'The bishop asked for his aide to share' })
  })

  it('fails a suggestion safely when its room was taken in the meantime', async () => {
    const late = await addParty(app, { name: 'Late Guest', category_id: null })
    await app.call(assign, '/api/room-assignments', { ...as(coordinator), body: { guest_id: late.principal_id, room_id: venue.rooms.get('101') } })
    const [single] = await app.sql<{ id: string }>(`select id from proposals where status = 'pending' and target_id = $1`, [eze.principal_id])

    const result = await app.call<{ status: string; error: string }>(approve, `/api/proposals/${single?.id}/approve`, { ...as(coordinator), params: { id: single?.id ?? '' }, body: {} })

    expect(result.body.data).toMatchObject({ status: 'failed', error: 'room_occupied' })
    expect(await roomOf(eze.principal_id)).toBeUndefined()
  })

  it('moves planned stays with the arrival, and proposes another room when theirs is no longer ready in time', async () => {
    const soon = await addParty(app, { name: 'Early Bird', category_id: null })
    await app.call(assign, '/api/room-assignments', { ...as(coordinator), body: { guest_id: soon.principal_id, room_id: venue.rooms.get('205') } })
    const [stay] = await app.sql<{ id: string }>(`select id from room_assignments where guest_id = $1 and status = 'planned'`, [soon.principal_id])
    const arriving = new Date(Date.now() + 5 * 60_000).toISOString()
    await app.sql(`update arrivals set expected_at_venue_at = $2 where id = $1`, [soon.arrival_id, arriving])
    await app.sql(`update rooms set housekeeping_status = 'needs_cleaning' where number = '205'`)

    const proposals = await withSystem(getSystemDb(), { actor: 'system' }, (tx) => reworkStays(tx, [soon.arrival_id], new Date(), null))

    expect(proposals).toBe(1)
    const [moved] = await app.sql<{ expected_check_in_at: Date }>(`select expected_check_in_at from room_assignments where id = $1`, [stay?.id])
    expect(moved?.expected_check_in_at.toISOString()).toBe(arriving)
    const [proposal] = await app.sql<{ id: string; replaces: string }>(`select id, payload ->> 'replaces' as replaces from proposals where status = 'pending' and target_id = $1`, [soon.principal_id])
    expect(proposal?.replaces).toBe(stay?.id)
    const approved = await app.call<{ status: string }>(approve, `/api/proposals/${proposal?.id}/approve`, { ...as(coordinator), params: { id: proposal?.id ?? '' }, body: {} })
    expect(approved.body.data.status).toBe('approved')
    expect((await roomOf(soon.principal_id))?.number).not.toBe('205')
    await app.sql(`update rooms set housekeeping_status = 'clean' where number = '205'`)
  })

  it('places an approved suggestion for the guest’s stay as it is now, not when it was suggested', async () => {
    const moving = await addParty(app, { name: 'Moving Target', category_id: null })
    await withSystem(getSystemDb(), { actor: 'system' }, (tx) => suggestRoomsForNewGuests(tx, new Date(`${EVENT_DAY}T06:00:00Z`)))
    const [suggestion] = await app.sql<{ id: string }>(`select id from proposals where status = 'pending' and target_id = $1`, [moving.principal_id])
    const later = new Date(`${EVENT_DAY}T21:30:00Z`).toISOString()
    await app.sql(`update arrivals set expected_at_venue_at = $2 where id = $1`, [moving.arrival_id, later])

    const approved = await app.call<{ status: string }>(approve, `/api/proposals/${suggestion?.id}/approve`, { ...as(coordinator), params: { id: suggestion?.id ?? '' }, body: {} })

    expect(approved.body.data.status).toBe('approved')
    const [stay] = await app.sql<{ expected_check_in_at: Date }>(`select expected_check_in_at from room_assignments where guest_id = $1 and status = 'planned'`, [moving.principal_id])
    expect(stay?.expected_check_in_at.toISOString()).toBe(later)
  })

  it('frees the room of a guest who is cancelled, and will not place them again', async () => {
    const gone = await addParty(app, { name: 'Cancelled Guest', category_id: null })
    const room = await freeRoom()
    await app.call(assign, '/api/room-assignments', { ...as(coordinator), body: { guest_id: gone.principal_id, room_id: room?.id } })
    expect(await roomOf(gone.principal_id)).toMatchObject({ number: room?.number, status: 'planned' })

    await app.sql(`update guests set status = 'cancelled' where id = $1`, [gone.principal_id])

    expect(await roomOf(gone.principal_id)).toBeUndefined()
    const again = await app.call(assign, '/api/room-assignments', { ...as(coordinator), body: { guest_id: gone.principal_id, room_id: room?.id } })
    expect(again.status).toBe(404)
  })

  describe('front desk', () => {
    const party = () => ({ ...as(frontDeskStaff), params: { id: okafor.delegation_id }, body: {} })

    it('lists arriving parties with their rooms and refuses a room that is not ready', async () => {
      const desk = await app.call<FrontDesk>(frontDesk, `/api/front-desk?day=${EVENT_DAY}`, as(frontDeskStaff))

      const card = desk.body.data.arriving.find((item) => item.delegation_id === okafor.delegation_id)
      expect(card).toMatchObject({ name: 'Augustine Okafor', category: 'Cat. 1', party_size: 3, rooms_ready: true })
      const principalRoom = (await roomOf(okafor.principal_id))?.number
      expect(card?.rooms[0]).toBe(principalRoom)
      expect(new Set(card?.rooms).size).toBe(card?.rooms.length)
      await app.sql(`update rooms set housekeeping_status = 'cleaning' where number = $1`, [principalRoom])
      const blocked = await app.call(checkIn, '/api/front-desk/x/check-in', party())
      await app.sql(`update rooms set housekeeping_status = 'clean' where number = $1`, [principalRoom])
      expect(blocked.status).toBe(409)
      expect(blocked.body.error?.code).toBe('room_not_ready')
    })

    it('checks the party in once, says who did it the second time, and can undo', async () => {
      const first = await app.call<{ rooms: string[] }>(checkIn, '/api/front-desk/x/check-in', party())
      expect(first.status).toBe(200)
      expect(first.body.data.rooms.length).toBeGreaterThanOrEqual(2)
      expect((await roomOf(okafor.principal_id))?.status).toBe('checked_in')

      const second = await app.call(checkIn, '/api/front-desk/x/check-in', { ...party(), as: coordinator })
      expect(second.body.error).toMatchObject({ code: 'already_checked_in', details: { by: 'Tolu Front' } })
      const desk = await app.call<FrontDesk>(frontDesk, `/api/front-desk?day=${EVENT_DAY}`, as(frontDeskStaff))
      expect(desk.body.data.in_house.map((item) => item.delegation_id)).toContain(okafor.delegation_id)

      expect((await app.call(undoCheckIn, '/api/front-desk/x/undo-check-in', party())).status).toBe(200)
      expect((await roomOf(okafor.principal_id))?.status).toBe('planned')
    })

    it('keeps a checked-in guest’s move out of Undo, and will not check anyone into a room still in use', async () => {
      expect((await app.call(checkIn, '/api/front-desk/x/check-in', party())).status).toBe(200)
      const aide = okafor.member_ids[1] ?? ''
      const room = await freeRoom()
      const acknowledged = await warningsFor(aide, room?.id ?? '')
      expect(acknowledged).toContain('checked_in')
      const moved = await app.call(assign, '/api/room-assignments', { ...as(coordinator), body: { guest_id: aide, room_id: room?.id, reason: 'Air conditioning failed in the first room', acknowledged } })
      expect(moved.status).toBe(201)

      expect((await app.call(undoCheckIn, '/api/front-desk/x/undo-check-in', party())).status).toBe(200)
      expect(await roomOf(aide)).toMatchObject({ number: room?.number, status: 'checked_in' })
      expect((await roomOf(okafor.principal_id))?.status).toBe('planned')

      const next = await addParty(app, { name: 'Next Guest', category_id: null })
      const overlap = await warningsFor(next.principal_id, room?.id ?? '')
      await app.call(assign, '/api/room-assignments', { ...as(coordinator), body: { guest_id: next.principal_id, room_id: room?.id, reason: 'Testing an overlap on purpose', acknowledged: overlap } })
      const blocked = await app.call(checkIn, '/api/front-desk/x/check-in', { ...as(frontDeskStaff), params: { id: next.delegation_id }, body: {} })
      expect(blocked.body.error).toMatchObject({ code: 'room_occupied', details: { rooms: [room?.number] } })
    })

    it('keeps rooms to coordinators and the front desk', async () => {
      const driver = await app.createStaff('driver')
      const programs = await app.createStaff('programs')
      expect((await app.call(frontDesk, '/api/front-desk', as(driver))).status).toBe(403)
      expect((await app.call(board, '/api/rooms/board', as(programs))).status).toBe(403)
      expect((await app.call(runAllocator, '/api/allocation/run', { ...as(frontDeskStaff), body: {} })).status).toBe(403)
    })
  })
})
