import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { POST as complete } from '@/app/api/cleaning/[id]/complete/route'
import { POST as report } from '@/app/api/cleaning/[id]/report/route'
import { POST as reverse } from '@/app/api/cleaning/[id]/reverse-checkout/route'
import { POST as start } from '@/app/api/cleaning/[id]/start/route'
import { POST as undoComplete } from '@/app/api/cleaning/[id]/undo-complete/route'
import { GET as queue } from '@/app/api/cleaning/route'
import { POST as checkOut } from '@/app/api/front-desk/[id]/check-out/route'
import type { CleaningView } from '@/lib/repositories/cleaning'
import { type Party, type Venue, addCategory, addParty, addVenue } from './support/rooms-fixture'
import { type StaffMember, TestApp } from './support/test-app'

vi.stubEnv('DATABASE_URL', 'pglite://memory')
vi.stubEnv('SERVICE_DATABASE_URL', 'pglite://memory')
vi.stubEnv('BETTER_AUTH_SECRET', 'integration-test-secret-'.padEnd(48, 'x'))
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')

describe('turnaround: check-out, the cleaning queue and housekeeping', () => {
  let app: TestApp
  let coordinator: StaffMember
  let frontDesk: StaffMember
  let housekeeper: StaffMember
  let venue: Venue
  let categoryRank = 10

  beforeAll(async () => {
    app = await TestApp.start()
    await app.createEvent()
    coordinator = await app.createStaff('coordinator')
    frontDesk = await app.createStaff('accommodation', { name: 'Tolu Front' })
    housekeeper = await app.createStaff('housekeeping', { name: 'Chioma Eze' })
    venue = await addVenue(app)
  })
  afterAll(async () => {
    await app.stop()
  })

  /** A party checked in, one guest per room in `rooms`. */
  async function checkedIn(name: string, rooms: readonly string[]): Promise<Party> {
    categoryRank += 1
    const party = await addParty(app, { name, category_id: await addCategory(app, `Cat. ${name}`, categoryRank), members: rooms.length - 1 })
    const guests = [party.principal_id, ...party.member_ids]
    for (const [index, guest] of guests.entries()) {
      await app.sql(
        `insert into room_assignments (room_id, guest_id, expected_check_in_at, expected_check_out_at, status, checked_in_at)
         values ($1, $2, now() - interval '1 day', now() + interval '1 hour', 'checked_in', now() - interval '1 day')`,
        [venue.rooms.get(rooms[index] ?? ''), guest],
      )
      await app.sql(`update guests set status = 'checked_in' where id = $1`, [guest])
    }
    return party
  }

  const post = (staff: StaffMember, id: string, body: unknown = {}) => ({ as: staff, params: { id }, body })
  const loadQueue = async (staff: StaffMember) => (await app.call<CleaningView>(queue, '/api/cleaning', { as: staff })).body.data
  const taskFor = async (room: string) => (await loadQueue(housekeeper)).queue.find((item) => item.room_number === room)

  it('checks a party out once; a second confirmation is told who did it', async () => {
    const party = await checkedIn('Okafor', ['301', '302'])

    const first = await app.call<{ rooms: string[] }>(checkOut, '/api/front-desk/x/check-out', post(frontDesk, party.delegation_id))
    const second = await app.call(checkOut, '/api/front-desk/x/check-out', post(coordinator, party.delegation_id))

    expect(first.status).toBe(200)
    expect(first.body.data.rooms).toEqual(['301', '302'])
    expect(second.status).toBe(409)
    expect(second.body.error).toMatchObject({ code: 'already_checked_out', details: { by: 'Tolu Front' } })
  })

  it('lets only one of two simultaneous check-outs win', async () => {
    const party = await checkedIn('Eze', ['201'])

    const results = await Promise.all([
      app.call(checkOut, '/api/front-desk/x/check-out', post(frontDesk, party.delegation_id)),
      app.call(checkOut, '/api/front-desk/x/check-out', post(coordinator, party.delegation_id)),
    ])

    expect(results.map((result) => result.status).sort()).toEqual([200, 409])
    expect(await app.sql(`select 1 from cleaning_tasks t join rooms r on r.id = t.room_id where r.number = '201'`)).toHaveLength(1)
  })

  it('shows housekeeping the rooms to clean, with ready estimates, and nothing about the guests', async () => {
    const view = await loadQueue(housekeeper)

    expect(view.summary).toMatchObject({ not_started: 3, in_progress: 0 })
    expect(view.queue.map((item) => item.room_number)).toEqual(['201', '301', '302'])
    expect(view.queue[0]).toMatchObject({ priority: 1, status: 'pending', wing: 'West', room_type: 'Standard', ready_by: expect.any(String) })
    expect(JSON.stringify(view)).not.toMatch(/Okafor|Eze/)
    expect((await app.call(queue, '/api/cleaning', { as: await app.createStaff('driver') })).status).toBe(403)
  })

  it('runs Start → Mark ready, with Undo, and refuses Done before Start', async () => {
    const task = await taskFor('301')
    if (!task) throw new Error('Expected a task for room 301')

    expect((await app.call(complete, '/api/cleaning/x/complete', post(housekeeper, task.task_id))).body.error).toMatchObject({ code: 'not_started' })
    expect((await app.call(start, '/api/cleaning/x/start', post(housekeeper, task.task_id))).status).toBe(200)
    expect((await app.call(start, '/api/cleaning/x/start', post(coordinator, task.task_id))).body.error).toMatchObject({ code: 'already_started', details: { by: 'Chioma Eze' } })
    expect(await taskFor('301')).toMatchObject({ priority: 1, status: 'in_progress' })

    expect((await app.call(complete, '/api/cleaning/x/complete', post(housekeeper, task.task_id))).status).toBe(200)
    const after = await loadQueue(housekeeper)
    expect(after.done).toEqual([expect.objectContaining({ room_number: '301', undoable: true })])
    expect(after.summary.done_today).toBe(1)
    expect(await app.sql(`select housekeeping_status from rooms where number = '301'`)).toEqual([{ housekeeping_status: 'clean' }])

    expect((await app.call(undoComplete, '/api/cleaning/x/undo-complete', post(housekeeper, task.task_id))).status).toBe(200)
    expect(await taskFor('301')).toMatchObject({ status: 'in_progress' })
    expect((await app.call(start, '/api/cleaning/x/start', post(frontDesk, task.task_id))).status).toBe(403)
  })

  it('takes problem reports with a validated kind', async () => {
    const task = await taskFor('302')
    if (!task) throw new Error('Expected a task for room 302')

    expect((await app.call(report, '/api/cleaning/x/report', post(housekeeper, task.task_id, { kind: 'flood' }))).status).toBe(400)
    const sent = await app.call(report, '/api/cleaning/x/report', post(housekeeper, task.task_id, { kind: 'supplies', note: '  No towels  ' }))

    expect(sent.status).toBe(200)
    expect(await taskFor('302')).toMatchObject({ problem_kind: 'supplies', problem_note: 'No towels' })
    expect(await app.sql(`select title from notifications where kind = 'cleaning_problem' and recipient_id = $1`, [coordinator.id])).toEqual([{ title: 'Room 302: missing supplies' }])
  })

  it('limits problem reports so one phone cannot flood the coordinators', async () => {
    const task = await taskFor('302')
    if (!task) throw new Error('Expected a task for room 302')
    // The test above made two attempts this minute (one refused as invalid); every attempt counts.
    const statuses: number[] = []
    for (let attempt = 0; attempt < 5; attempt += 1) {
      statuses.push((await app.call(report, '/api/cleaning/x/report', post(housekeeper, task.task_id, { kind: 'other', note: `Report ${attempt}` }))).status)
    }
    expect(statuses).toEqual([200, 200, 200, 429, 429])
  })

  it('lets a coordinator reverse a check-out that has not been cleaned yet', async () => {
    const task = await taskFor('201')
    if (!task) throw new Error('Expected a task for room 201')

    expect((await app.call(reverse, '/api/cleaning/x/reverse-checkout', post(frontDesk, task.task_id))).status).toBe(403)
    const reversed = await app.call<{ room_number: string }>(reverse, '/api/cleaning/x/reverse-checkout', post(coordinator, task.task_id))

    expect(reversed.body.data).toMatchObject({ room_number: '201', restored: 1 })
    expect(await taskFor('201')).toBeUndefined()
    expect(await app.sql(`select a.status from room_assignments a join rooms r on r.id = a.room_id where r.number = '201'`)).toEqual([{ status: 'checked_in' }])
    const started = await taskFor('301')
    expect((await app.call(reverse, '/api/cleaning/x/reverse-checkout', post(coordinator, started?.task_id ?? ''))).body.error).toMatchObject({ code: 'cleaning_started' })
  })
})
