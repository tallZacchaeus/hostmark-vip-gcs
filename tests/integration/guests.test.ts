import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { POST as addMember } from '@/app/api/delegations/[id]/members/route'
import { POST as resolveIssue } from '@/app/api/guest-requirements/[id]/resolve/route'
import { DELETE as removeGuest, GET as getProfile, PATCH as patchGuest } from '@/app/api/guests/[id]/route'
import { POST as addGuest, GET as listGuests } from '@/app/api/guests/route'
import { EVENT_DAY, addDays } from '@/tests/support/event-dates'
import { type StaffMember, TestApp } from './support/test-app'

vi.stubEnv('DATABASE_URL', 'pglite://memory')
vi.stubEnv('SERVICE_DATABASE_URL', 'pglite://memory')
vi.stubEnv('BETTER_AUTH_SECRET', 'integration-test-secret-'.padEnd(48, 'x'))
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')

interface Created {
  delegation_id: string
  principal_guest_id: string
  pickup_id: string | null
}

interface Profile {
  guest: { id: string; full_name: string; version: number; vip_category_id: string | null }
  delegation: { id: string; name: string }
  members: { id: string; member_role: string; full_name: string | null }[]
  pickup: { passenger_count: number } | null
  requirements: { id: string; resolved_at: string | null }[]
  history: { action: string }[]
}

const PICKUP_GUEST = {
  title: 'Dr',
  full_name: 'Ngozi Eze',
  contact_name: 'Ngozi Eze',
  contact_phone: '+2348030000002',
  arrival_mode: 'pickup',
  pickup_address: 'Victoria Island, Lagos',
  arrival_date: EVENT_DAY,
  arrival_time: '16:30',
  departure_date: addDays(EVENT_DAY, 2),
}

describe('guests API', () => {
  let app: TestApp
  let coordinator: StaffMember
  let frontDesk: StaffMember
  let created: Created

  beforeAll(async () => {
    app = await TestApp.start()
    await app.createEvent()
    coordinator = await app.createStaff('coordinator')
    frontDesk = await app.createStaff('accommodation')
    const result = await app.call<Created>(addGuest, '/api/guests', { as: coordinator, body: { fields: PICKUP_GUEST } })
    expect(result.status).toBe(201)
    created = result.body.data
  })
  afterAll(async () => {
    vi.unstubAllEnvs()
    await app.stop()
  })

  it('adds a guest by hand with an arrival and a location pickup, and warns before a duplicate', async () => {
    expect(created.pickup_id).not.toBeNull()
    const again = await app.call(addGuest, '/api/guests', { as: coordinator, body: { fields: PICKUP_GUEST } })
    expect(again.status).toBe(409)
    expect(again.body.error?.code).toBe('possible_duplicate')
    const incomplete = await app.call(addGuest, '/api/guests', { as: coordinator, body: { fields: { ...PICKUP_GUEST, pickup_address: '' } } })
    expect(incomplete.status).toBe(400)
  })

  it('lists one row per delegation with a count per tab, for the front desk too', async () => {
    const result = await app.call<{ rows: { full_name: string; companions: number; arrival_mode: string; pickup_status: string }[]; tabs: Record<string, number> }>(
      listGuests,
      '/api/guests?search=eze',
      { as: frontDesk },
    )
    expect(result.status).toBe(200)
    expect(result.body.data.rows).toEqual([expect.objectContaining({ full_name: 'Ngozi Eze', companions: 0, arrival_mode: 'pickup', pickup_status: 'pending_assignment' })])
    expect(result.body.data.tabs).toMatchObject({ all: 1, attention: 0, arrived: 0 })
  })

  it('opens the profile by guest id or by delegation id', async () => {
    const byGuest = await app.call<Profile>(getProfile, `/api/guests/${created.principal_guest_id}`, { as: coordinator, params: { id: created.principal_guest_id } })
    const byDelegation = await app.call<Profile>(getProfile, `/api/guests/${created.delegation_id}`, { as: coordinator, params: { id: created.delegation_id } })
    expect(byGuest.status).toBe(200)
    expect(byDelegation.body.data.guest.id).toBe(created.principal_guest_id)
    expect(byGuest.body.data.delegation.name).toBe('Dr Ngozi Eze')
    expect(byGuest.body.data.history.length).toBeGreaterThan(0)
  })

  it('updates a guest with optimistic locking and renames the delegation with its principal', async () => {
    const id = created.principal_guest_id
    const updated = await app.call<{ version: number }>(patchGuest, `/api/guests/${id}`, { as: coordinator, params: { id }, body: { version: 1, title: 'Prof', proximity_priority: 'high' } })
    expect(updated.status).toBe(200)
    expect(updated.body.data.version).toBe(2)
    const stale = await app.call(patchGuest, `/api/guests/${id}`, { as: coordinator, params: { id }, body: { version: 1, notes: 'late change' } })
    expect(stale.status).toBe(409)
    expect(stale.body.error?.code).toBe('stale_version')
    const [delegation] = await app.sql<{ name: string }>('select name from delegations where id = $1', [created.delegation_id])
    expect(delegation?.name).toBe('Prof Ngozi Eze')
    const readOnly = await app.call(patchGuest, `/api/guests/${id}`, { as: frontDesk, params: { id }, body: { version: 2, notes: 'x' } })
    expect(readOnly.status).toBe(403)
  })

  it('adds and removes party members, keeping the pickup passenger count in step', async () => {
    const id = created.delegation_id
    const member = await app.call<{ id: string; is_placeholder: boolean }>(addMember, `/api/delegations/${id}/members`, { as: coordinator, params: { id }, body: { member_role: 'assistant' } })
    expect(member.status).toBe(201)
    expect(member.body.data.is_placeholder).toBe(true)
    const [afterAdd] = await app.sql<{ passenger_count: number }>('select passenger_count from pickups where id = $1', [created.pickup_id])
    expect(afterAdd?.passenger_count).toBe(2)

    const memberId = member.body.data.id
    expect((await app.call(removeGuest, `/api/guests/${memberId}`, { as: coordinator, params: { id: memberId } })).status).toBe(200)
    const [afterRemove] = await app.sql<{ passenger_count: number }>('select passenger_count from pickups where id = $1', [created.pickup_id])
    expect(afterRemove?.passenger_count).toBe(1)

    const principal = created.principal_guest_id
    const refused = await app.call(removeGuest, `/api/guests/${principal}`, { as: coordinator, params: { id: principal } })
    expect(refused.body.error?.code).toBe('cannot_remove_principal')
  })

  it('resolves an open issue once, and "Add as guest" resolves it while adding the person', async () => {
    const [first] = await app.sql<{ id: string }>(
      `insert into guest_requirements (guest_id, category, detail, source, needs_attention) values ($1, 'schedule', 'Rev Chidi may join later', 'extraction', true) returning id`,
      [created.principal_guest_id],
    )
    const [second] = await app.sql<{ id: string }>(
      `insert into guest_requirements (guest_id, category, detail, source, needs_attention) values ($1, 'medical', 'Nut allergy', 'extraction', true) returning id`,
      [created.principal_guest_id],
    )
    const id = second?.id ?? ''
    expect((await app.call(resolveIssue, `/api/guest-requirements/${id}/resolve`, { as: coordinator, params: { id } })).status).toBe(200)
    expect((await app.call(resolveIssue, `/api/guest-requirements/${id}/resolve`, { as: coordinator, params: { id } })).body.error?.code).toBe('already_resolved')

    const delegation = created.delegation_id
    const added = await app.call(addMember, `/api/delegations/${delegation}/members`, {
      as: coordinator,
      params: { id: delegation },
      body: { member_role: 'assistant', full_name: 'Rev Chidi', requirement_id: first?.id },
    })
    expect(added.status).toBe(201)
    const open = await app.sql<{ n: number }>('select count(*)::int as n from guest_requirements where resolved_at is null')
    expect(open[0]?.n).toBe(0)
  })
})
