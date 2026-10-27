import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { POST as notifyTeam } from '@/app/api/program-items/[id]/notify/route'
import { PUT as putParticipants } from '@/app/api/program-items/[id]/participants/route'
import { DELETE as deleteItem, PATCH as patchItem } from '@/app/api/program-items/[id]/route'
import { POST as createItem } from '@/app/api/program-items/route'
import { GET as programmeGuests } from '@/app/api/programme/guests/route'
import { GET as programme } from '@/app/api/programme/route'
import { getSystemDb, withSystem } from '@/lib/db/system'
import type { FlightSnapshot } from '@/lib/flights/provider'
import type { ProgrammeGuest, ProgrammeView } from '@/lib/repositories/programme'
import { ingestFlightUpdate } from '@/lib/services/flights/ingest'
import { EVENT_DAY, type FlightParty, addFlightParty } from './support/transport-fixture'
import { type StaffMember, TestApp } from './support/test-app'

vi.stubEnv('DATABASE_URL', 'pglite://memory')
vi.stubEnv('SERVICE_DATABASE_URL', 'pglite://memory')
vi.stubEnv('BETTER_AUTH_SECRET', 'integration-test-secret-'.padEnd(48, 'x'))
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')

const LANDS = `${EVENT_DAY}T12:00:00Z`
const briefing = {
  title: 'Welcome briefing',
  kind: 'session',
  starts_at: `${EVENT_DAY}T14:30:00Z`,
  ends_at: `${EVENT_DAY}T15:30:00Z`,
  location: 'Conference hall A',
  status: 'draft',
}

const snapshot = (estimated: string): FlightSnapshot => ({
  phase: 'in_air',
  scheduled_arrival_at: LANDS,
  estimated_arrival_at: estimated,
  actual_arrival_at: null,
  origin_iata: 'DXB',
  destination_iata: 'LOS',
})

describe('programme: editing, the published timeline and at-risk items', () => {
  let app: TestApp
  let programs: StaffMember
  let coordinator: StaffMember
  let party: FlightParty
  let itemId: string

  beforeAll(async () => {
    app = await TestApp.start()
    await app.createEvent()
    programs = await app.createStaff('programs')
    coordinator = await app.createStaff('coordinator')
    party = await addFlightParty(app, { delegation: 'Okafor', flight_number: 'EK783', scheduled_arrival_at: LANDS, passengers: 1 })
  })
  afterAll(async () => {
    await app.stop()
  })

  const view = async (staff: StaffMember) => (await app.call<ProgrammeView>(programme, `/api/programme?day=${EVENT_DAY}`, { as: staff })).body.data
  const ingest = (estimated: string) =>
    withSystem(getSystemDb(), { actor: 'system', action: 'flights.update' }, (tx) =>
      ingestFlightUpdate(tx, { flight_id: party.flight_id, snapshot: snapshot(estimated), source: 'simulated', observed_at: new Date() }),
    )

  it('lets the programs team add a draft and list participants; coordinators cannot edit', async () => {
    expect((await app.call(createItem, '/api/program-items', { as: coordinator, body: briefing })).status).toBe(403)
    expect((await app.call(createItem, '/api/program-items', { as: programs, body: { ...briefing, ends_at: briefing.starts_at } })).status).toBe(400)

    const created = await app.call<{ id: string }>(createItem, '/api/program-items', { as: programs, body: briefing })
    expect(created.status).toBe(201)
    itemId = created.body.data.id
    const guests = (await app.call<ProgrammeGuest[]>(programmeGuests, '/api/programme/guests', { as: programs })).body.data
    const speaker = guests.find((guest) => guest.delegation === 'Okafor')
    expect(speaker).toBeDefined()

    const put = await app.call(putParticipants, '/api/program-items/x/participants', { method: 'PUT', as: programs, params: { id: itemId }, body: { participants: [{ guest_id: speaker?.id, role: 'speaker' }] } })
    expect(put.status).toBe(200)
    expect((await app.call(programmeGuests, '/api/programme/guests', { as: coordinator })).status).toBe(403)
  })

  it('shows drafts to editors only, and the published item to coordinators', async () => {
    const draftView = await view(programs)
    expect(draftView).toMatchObject({ day: EVENT_DAY, can_edit: true, lead_time_min: 30, at_risk_count: 0 })
    expect(draftView.items).toEqual([expect.objectContaining({ title: 'Welcome briefing', status: 'draft', state: 'track', participants: [expect.objectContaining({ role: 'speaker', late: false })] })])
    expect((await view(coordinator)).items).toEqual([])

    const published = await app.call(patchItem, '/api/program-items/x', { method: 'PATCH', as: programs, params: { id: itemId }, body: { ...briefing, status: 'published' } })
    expect(published.status).toBe(200)
    const coordinatorView = await view(coordinator)
    expect(coordinatorView).toMatchObject({ can_edit: false, venues: [{ name: 'Conference hall A', count: 1 }] })
    expect(coordinatorView.items).toHaveLength(1)
  })

  it('flags the item when a simulated delay makes the speaker late, for programs and coordinators, and clears it when resolved', async () => {
    await ingest(`${EVENT_DAY}T13:15:00Z`)

    const flagged = await view(coordinator)
    expect(flagged.at_risk_count).toBe(1)
    expect(flagged.items[0]).toMatchObject({ state: 'risk', at_risk: true, participants: [expect.objectContaining({ late: true })] })
    for (const staff of [programs, coordinator]) {
      const notes = await app.sql<{ title: string }>(`select title from notifications where recipient_id = $1 and kind = 'program_at_risk'`, [staff.id])
      expect(notes).toEqual([{ title: expect.stringMatching(/^Welcome briefing at risk: .+ Okafor expected \d\d:\d\d$/) }])
    }

    const notified = await app.call<{ notified_at: string }>(notifyTeam, '/api/program-items/x/notify', { as: coordinator, params: { id: itemId }, body: {} })
    expect(notified.status).toBe(200)
    expect((await view(coordinator)).items[0]?.risk_notified_at).toEqual(expect.any(String))

    await ingest(LANDS)
    const cleared = await view(coordinator)
    expect(cleared.at_risk_count).toBe(0)
    expect(cleared.items[0]).toMatchObject({ state: 'track', at_risk: false })
    expect((await app.call(notifyTeam, '/api/program-items/x/notify', { as: coordinator, params: { id: itemId }, body: {} })).body.error).toMatchObject({ code: 'not_at_risk' })
  })

  it('lets editors delete an item', async () => {
    expect((await app.call(deleteItem, '/api/program-items/x', { method: 'DELETE', as: coordinator, params: { id: itemId } })).status).toBe(403)
    expect((await app.call(deleteItem, '/api/program-items/x', { method: 'DELETE', as: programs, params: { id: itemId } })).status).toBe(200)
    expect((await view(programs)).items).toEqual([])
  })
})
