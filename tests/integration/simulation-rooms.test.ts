import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { POST as checkIn } from '@/app/api/front-desk/[id]/check-in/route'
import { POST as approve } from '@/app/api/proposals/[id]/approve/route'
import { POST as assign } from '@/app/api/room-assignments/route'
import { GET as listRuns, POST as startRun } from '@/app/api/simulation/runs/route'
import { getSystemDb, withSystem } from '@/lib/db/system'
import type { RunSummary } from '@/lib/repositories/simulation'
import { reworkRoom, suggestRoomsForNewGuests } from '@/lib/services/rooms/suggest'
import { advanceSimulationRuns } from '@/lib/services/simulation/runner'
import { EVENT_DAY, type Party, type Venue, addParty, addVenue } from './support/rooms-fixture'
import { type StaffMember, TestApp } from './support/test-app'

vi.stubEnv('DATABASE_URL', 'pglite://memory')
vi.stubEnv('SERVICE_DATABASE_URL', 'pglite://memory')
vi.stubEnv('BETTER_AUTH_SECRET', 'integration-test-secret-'.padEnd(48, 'x'))
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')

interface StartedRun {
  readonly id: string
  readonly flight_ids: string[]
  readonly room_ids: string[]
  readonly delegation_ids: string[]
  readonly virtual_start: string
}

describe('simulation room scenarios', () => {
  let app: TestApp
  let coordinator: StaffMember
  let frontDesk: StaffMember
  let venue: Venue
  let okafor: Party
  let eze: Party

  beforeAll(async () => {
    app = await TestApp.start()
    await app.createEvent()
    coordinator = await app.createStaff('coordinator')
    frontDesk = await app.createStaff('accommodation')
    venue = await addVenue(app)
    okafor = await addParty(app, { name: 'Augustine Okafor', category_id: null, arrival_at: `${EVENT_DAY}T14:00:00Z` })
    eze = await addParty(app, { name: 'Ngozi Eze', category_id: null, arrival_at: `${EVENT_DAY}T16:00:00Z` })
  })
  afterAll(async () => {
    await app.stop()
  })

  const as = (staff: StaffMember) => ({ as: staff })
  const start = (scenario_key: string) => app.call<StartedRun>(startRun, '/api/simulation/runs', { ...as(coordinator), body: { scenario_key, speed: 60 } })
  const advance = () => advanceSimulationRuns(getSystemDb(), new Date(Date.now() + 60_000))
  const room = (number: string) => venue.rooms.get(number) ?? ''
  const stayOf = async (guestId: string) =>
    (await app.sql<{ id: string; room_id: string; status: string }>(`select id, room_id, status from room_assignments where guest_id = $1 and status in ('planned', 'checked_in')`, [guestId]))[0]
  const systemAudit = (table: string) =>
    app.sql<{ entity_id: string }>(`select entity_id from audit_log where entity_type = $1 and action = 'simulation.step' and actor_type = 'system'`, [table])

  it('needs rooms planned before a room scenario can start', async () => {
    const outOfService = await start('room-out-of-service')
    expect(outOfService.status).toBe(409)
    expect(outOfService.body.error?.code).toBe('not_enough_rooms')

    const extra = await start('extra-guests')
    expect(extra.status).toBe(409)
    expect(extra.body.error?.code).toBe('not_enough_delegations')
  })

  it('takes the room of the next planned stay out of service, as the system, and proposes a move', async () => {
    expect((await app.call(assign, '/api/room-assignments', { ...as(coordinator), body: { guest_id: okafor.principal_id, room_id: room('301') } })).status).toBe(201)
    expect((await app.call(assign, '/api/room-assignments', { ...as(coordinator), body: { guest_id: eze.principal_id, room_id: room('101') } })).status).toBe(201)
    const stay = await stayOf(okafor.principal_id)

    const started = await start('room-out-of-service')

    expect(started.status).toBe(201)
    expect(started.body.data).toMatchObject({ flight_ids: [], room_ids: [room('301')], delegation_ids: [] })
    // Virtual time starts two hours before the guest is expected.
    expect(new Date(started.body.data.virtual_start).toISOString()).toBe(`${EVENT_DAY}T12:00:00.000Z`)
    expect(await advance()).toBe(1)

    const [updated] = await app.sql<{ out_of_service: boolean }>('select out_of_service from rooms where id = $1', [room('301')])
    expect(updated?.out_of_service).toBe(true)
    expect(await systemAudit('rooms')).toContainEqual(expect.objectContaining({ entity_id: room('301') }))
    const proposals = await app.sql<{ id: string; title: string; replaces: string; room_id: string; trigger_type: string }>(
      `select id, title, payload ->> 'replaces' as replaces, payload ->> 'room_id' as room_id, trigger_type from proposals
       where status = 'pending' and kind = 'room_assignment' and target_id = $1`,
      [okafor.principal_id],
    )
    expect(proposals).toHaveLength(1)
    expect(proposals[0]).toMatchObject({ replaces: stay?.id, title: expect.stringMatching(/^Move Augustine Okafor from room 301 to /) })
    expect(proposals[0]?.room_id).not.toBe(room('301'))

    const runs = await app.call<{ runs: RunSummary[] }>(listRuns, '/api/simulation/runs', as(coordinator))
    expect(runs.body.data.runs[0]).toMatchObject({ status: 'completed', steps_applied: 1, steps_total: 1, flight_numbers: [], room_numbers: ['301'], delegations: [] })

    const approved = await app.call<{ status: string }>(approve, `/api/proposals/${proposals[0]?.id}/approve`, { ...as(coordinator), params: { id: proposals[0]?.id ?? '' }, body: {} })
    expect(approved.body.data.status).toBe('approved')
    expect((await stayOf(okafor.principal_id))?.room_id).toBe(proposals[0]?.room_id)
  })

  it('alerts the coordinators instead when the guest in the room has already checked in', async () => {
    expect((await app.call(checkIn, '/api/front-desk/x/check-in', { ...as(frontDesk), params: { id: eze.delegation_id }, body: {} })).status).toBe(200)
    await app.sql('update rooms set out_of_service = true where id = $1', [room('101')])

    const proposals = await withSystem(getSystemDb(), { actor: 'system' }, (tx) => reworkRoom(tx, room('101'), new Date(), null))

    expect(proposals).toBe(0)
    const alerts = await app.sql<{ title: string; priority: string }>(`select distinct title, priority from notifications where kind = 'room_alert' and entity_id = $1`, [eze.principal_id])
    expect(alerts).toEqual([{ title: 'Ngozi Eze is checked in to room 101, which can no longer be used', priority: 'high' }])
    expect((await stayOf(eze.principal_id))?.status).toBe('checked_in')
  })

  it('adds two unnamed companions to a delegation with rooms, and the worker suggests rooms for them', async () => {
    const started = await start('extra-guests')

    expect(started.status).toBe(201)
    expect(started.body.data).toMatchObject({ room_ids: [], delegation_ids: [okafor.delegation_id] })
    expect(await advance()).toBe(1)

    const companions = await app.sql<{ id: string; member_role: string; full_name: string | null; is_placeholder: boolean; arrival_id: string }>(
      `select id, member_role, full_name, is_placeholder, arrival_id from guests where delegation_id = $1 and member_role <> 'principal'`,
      [okafor.delegation_id],
    )
    expect(companions).toHaveLength(2)
    expect(companions.every((guest) => guest.member_role === 'other' && guest.full_name === null && guest.is_placeholder && guest.arrival_id === okafor.arrival_id)).toBe(true)
    const audited = (await systemAudit('guests')).map((row) => row.entity_id)
    expect(audited).toEqual(expect.arrayContaining(companions.map((guest) => guest.id)))

    // The worker's incremental pass (every minute) proposes a room for each of them.
    expect(await withSystem(getSystemDb(), { actor: 'system' }, (tx) => suggestRoomsForNewGuests(tx, new Date(`${EVENT_DAY}T06:00:00Z`)))).toBe(2)
    const suggested = await app.sql<{ target_id: string }>(`select target_id from proposals where status = 'pending' and kind = 'room_assignment' and parent_id is null`)
    expect(suggested.map((row) => row.target_id).sort()).toEqual(companions.map((guest) => guest.id).sort())

    const runs = await app.call<{ runs: RunSummary[] }>(listRuns, '/api/simulation/runs', as(coordinator))
    expect(runs.body.data.runs[0]).toMatchObject({ status: 'completed', delegations: ['Augustine Okafor'], room_numbers: [] })
  })

  it('applies a room step once even when two worker passes race', async () => {
    const started = await start('room-out-of-service')
    expect(started.status).toBe(201)

    const applied = await Promise.all([advance(), advance()])

    expect(applied[0] + applied[1]).toBe(1)
    const [run] = await app.sql<{ steps_applied: number; status: string }>('select steps_applied, status from simulation_runs where id = $1', [started.body.data.id])
    expect(run).toEqual({ steps_applied: 1, status: 'completed' })
  })
})
