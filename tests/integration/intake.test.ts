import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { GET as linkContext, POST as register } from '@/app/api/intake/[token]/route'
import { POST as readMessage } from '@/app/api/intake/read-message/route'
import { POST as approve } from '@/app/api/intake/submissions/[id]/approve/route'
import { POST as link } from '@/app/api/intake/submissions/[id]/link/route'
import { POST as reject } from '@/app/api/intake/submissions/[id]/reject/route'
import { POST as undoAuto } from '@/app/api/intake/submissions/[id]/undo/route'
import { GET as getSubmission, PATCH as patchSubmission } from '@/app/api/intake/submissions/[id]/route'
import { GET as listSubmissions, POST as createDraft } from '@/app/api/intake/submissions/route'
import { DAY_BEFORE_EVENT, EVENT_DAY, EVENT_LAST_DAY, addDays } from '@/tests/support/event-dates'
import { type StaffMember, TestApp } from './support/test-app'

vi.stubEnv('DATABASE_URL', 'pglite://memory')
vi.stubEnv('SERVICE_DATABASE_URL', 'pglite://memory')
vi.stubEnv('BETTER_AUTH_SECRET', 'integration-test-secret-'.padEnd(48, 'x'))
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')

interface Receipt {
  reference_code: string
  follow_up: boolean
  summary: { guest: string; companions: number; arrival_mode: string; flight_number: string | null }
}

/** "2026-11-21" → "21st November". */
function spokenDate(day: string): string {
  const date = Number(day.slice(8, 10))
  const suffix = date % 10 === 1 && date !== 11 ? 'st' : date % 10 === 2 && date !== 12 ? 'nd' : date % 10 === 3 && date !== 13 ? 'rd' : 'th'
  const month = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })
  return `${date}${suffix} ${month}`
}

let ipCounter = 0
const freshIp = (): string => `198.51.100.${(ipCounter += 1)}`

const OWN_TRANSPORT = {
  title: 'Bishop',
  full_name: 'augustine okafor',
  organisation: 'Diocese of Lagos West',
  contact_name: 'Grace Adeyemi',
  contact_email: 'Office@Diocese.example',
  contact_phone: '0803 555 0142',
  arrival_mode: 'own_transport',
  arrival_date: EVENT_DAY,
  arrival_time: '14:30',
  departure_date: EVENT_LAST_DAY,
  dietary: 'vegetarian',
}

const FLYING = {
  full_name: 'Ama Owusu',
  contact_name: 'Kofi Mensah',
  contact_email: 'kofi@example.com',
  arrival_mode: 'flying',
  airline: 'Emirates',
  flight_number: 'ek 783',
  arrival_date: DAY_BEFORE_EVENT,
  arrival_time: '13:40',
  departure_date: addDays(EVENT_DAY, 2),
  others: 'Vegetarian meals please.',
  party: [{ name: 'Yaw Owusu', role: 'family' }, { role: 'security' }],
}

describe('intake: public registration, review queue and pasted messages', () => {
  let app: TestApp
  let coordinator: StaffMember
  let driver: StaffMember
  let token: string

  const submit = (form: object, ip = freshIp(), path = token) =>
    app.call<Receipt>(register, `/api/intake/${path}`, { body: { form, consent: true }, params: { token: path }, headers: { 'x-forwarded-for': ip } })

  beforeAll(async () => {
    app = await TestApp.start()
    await app.createEvent()
    const [event] = await app.sql<{ intake_token: string }>('update events set intake_open = true returning intake_token')
    token = event?.intake_token ?? ''
    coordinator = await app.createStaff('coordinator')
    driver = await app.createStaff('driver')
  })
  afterAll(async () => {
    vi.unstubAllEnvs()
    await app.stop()
  })

  describe('the public link', () => {
    it('describes an open link without revealing the token or other settings', async () => {
      const result = await app.call(linkContext, `/api/intake/${token}`, { params: { token } })
      expect(result.status).toBe(200)
      expect(result.body.data).toEqual({
        open: true,
        event_name: 'Annual Summit',
        venue_name: 'Grand Hotel',
        timezone: 'Africa/Lagos',
        starts_on: EVENT_DAY,
        ends_on: EVENT_LAST_DAY,
        intake_window_days: 3,
        turnstile_site_key: null,
      })
    })

    it('rejects an unknown link and a submission without consent', async () => {
      expect((await app.call(linkContext, '/api/intake/nope', { params: { token: 'nope' } })).status).toBe(404)
      expect((await submit(OWN_TRANSPORT, freshIp(), 'nope')).body.error?.code).toBe('invalid_link')
      const noConsent = await app.call(register, `/api/intake/${token}`, { body: { form: OWN_TRANSPORT, consent: false }, params: { token } })
      expect(noConsent.status).toBe(400)
    })

    it('refuses submissions while the link is closed', async () => {
      await app.sql('update events set intake_open = false')
      const result = await submit(OWN_TRANSPORT)
      await app.sql('update events set intake_open = true')
      expect(result.status).toBe(409)
      expect(result.body.error?.code).toBe('intake_closed')
    })
  })

  describe('automatic processing', () => {
    it('creates the delegation, guests and arrival for a clean registration, as the intake actor', async () => {
      const result = await submit(OWN_TRANSPORT)

      expect(result.status).toBe(201)
      expect(result.body.data.reference_code).toMatch(/^VIP-[A-Z0-9]{4}$/)
      expect(result.body.data.follow_up).toBe(false)
      expect(result.body.data.summary).toMatchObject({ guest: 'Bishop Augustine Okafor', companions: 0, arrival_mode: 'own_transport' })

      const [submission] = await app.sql<{ status: string; delegation_id: string; client_ip_hash: string }>(
        'select status, delegation_id, client_ip_hash from intake_submissions where reference_code = $1',
        [result.body.data.reference_code],
      )
      expect(submission?.status).toBe('auto_processed')
      expect(submission?.client_ip_hash).toMatch(/^[0-9a-f]{64}$/)
      const [delegation] = await app.sql<{ name: string; contact_email: string; contact_phone: string }>(
        'select name, contact_email, contact_phone from delegations where id = $1',
        [submission?.delegation_id],
      )
      expect(delegation).toEqual({ name: 'Bishop Augustine Okafor', contact_email: 'office@diocese.example', contact_phone: '+2348035550142' })
      const [arrival] = await app.sql<{ mode: string; stated_arrival_at: Date }>('select mode, stated_arrival_at from arrivals where delegation_id = $1', [submission?.delegation_id])
      expect(arrival?.mode).toBe('own_transport')
      expect(arrival?.stated_arrival_at.toISOString()).toBe(`${EVENT_DAY}T13:30:00.000Z`)
      const actors = await app.sql<{ actor_type: string; is_automatic: boolean }>(
        `select distinct actor_type, is_automatic from audit_log where entity_type in ('delegations', 'guests', 'arrivals')`,
      )
      expect(actors).toEqual([{ actor_type: 'guest_intake', is_automatic: true }])
      const notices = await app.sql<{ kind: string }>('select kind from notifications where recipient_id = $1', [coordinator.id])
      expect(notices.map((notice) => notice.kind)).toContain('intake_auto_processed')
    })

    it('tracks the flight, books an airport pickup for the party and keeps typed requirements', async () => {
      const result = await submit(FLYING)
      expect(result.body.data.follow_up).toBe(false)

      const [row] = await app.sql<{ flight_number: string; airline_iata: string; kind: string; passenger_count: number; pickup_at: Date }>(
        `select f.flight_number, f.airline_iata, p.kind, p.passenger_count, p.pickup_at
         from intake_submissions s join arrivals a on a.delegation_id = s.delegation_id
         join flights f on f.id = a.flight_id join pickups p on p.arrival_id = a.id
         where s.reference_code = $1`,
        [result.body.data.reference_code],
      )
      expect(row).toMatchObject({ flight_number: 'EK783', airline_iata: 'EK', kind: 'airport', passenger_count: 3 })
      // 13:40 Lagos = 12:40Z, plus the 30-minute airport exit buffer.
      expect(row?.pickup_at.toISOString()).toBe(`${DAY_BEFORE_EVENT}T13:10:00.000Z`)
      const guests = await app.sql<{ member_role: string; is_placeholder: boolean }>(
        `select g.member_role::text, g.is_placeholder from guests g join intake_submissions s on s.delegation_id = g.delegation_id
         where s.reference_code = $1 order by g.member_role::text`,
        [result.body.data.reference_code],
      )
      expect(guests).toEqual([
        { member_role: 'family', is_placeholder: false },
        { member_role: 'principal', is_placeholder: false },
        { member_role: 'security', is_placeholder: true },
      ])
      const requirements = await app.sql<{ category: string; source: string }>(
        `select r.category, r.source from guest_requirements r join guests g on g.id = r.guest_id
         join intake_submissions s on s.delegation_id = g.delegation_id where s.reference_code = $1`,
        [result.body.data.reference_code],
      )
      expect(requirements).toEqual([{ category: 'dietary', source: 'extraction' }])
    })

    it('links an exact duplicate to the existing delegation instead of creating another', async () => {
      const before = await app.sql<{ n: number }>('select count(*)::int as n from delegations')
      const result = await submit(OWN_TRANSPORT)
      const after = await app.sql<{ n: number }>('select count(*)::int as n from delegations')

      expect(result.body.data.follow_up).toBe(false)
      expect(after[0]?.n).toBe(before[0]?.n)
      const [submission] = await app.sql<{ status: string; duplicate_kind: string }>('select status, duplicate_kind from intake_submissions where reference_code = $1', [result.body.data.reference_code])
      expect(submission).toEqual({ status: 'linked_duplicate', duplicate_kind: 'exact' })
    })

    it('undoes automatic processing once, returning the submission to review', async () => {
      const result = await submit({ ...OWN_TRANSPORT, full_name: 'Esther Boateng', contact_email: 'esther@example.org', contact_phone: '' })
      const [submission] = await app.sql<{ id: string; delegation_id: string }>('select id, delegation_id from intake_submissions where reference_code = $1', [result.body.data.reference_code])
      const id = submission?.id ?? ''
      const [rowUndo] = await app.sql<{ n: number }>(`select count(*)::int as n from audit_log where entity_id = $1 and undoable`, [submission?.delegation_id])
      expect(rowUndo?.n).toBe(0)

      const undone = await app.call(undoAuto, `/api/intake/submissions/${id}/undo`, { as: coordinator, params: { id } })
      expect(undone.status).toBe(200)
      const [after] = await app.sql<{ status: string; delegation_id: string | null; guests: number }>(
        `select s.status, s.delegation_id, (select count(*)::int from guests g where g.delegation_id = $2) as guests
         from intake_submissions s where s.id = $1`,
        [id, submission?.delegation_id],
      )
      expect(after).toEqual({ status: 'needs_review', delegation_id: null, guests: 0 })
      const again = await app.call(undoAuto, `/api/intake/submissions/${id}/undo`, { as: coordinator, params: { id } })
      expect(again.body.error?.code).toBe('not_auto_processed')
    })

    it('limits registrations per client IP', async () => {
      const ip = freshIp()
      const statuses: number[] = []
      for (let attempt = 0; attempt < 11; attempt += 1) {
        statuses.push((await submit({ ...OWN_TRANSPORT, full_name: `Guest ${attempt}`, contact_email: `g${attempt}@example.com` }, ip)).status)
      }
      expect(statuses.slice(0, 10).every((status) => status === 201)).toBe(true)
      expect(statuses[10]).toBe(429)
    })
  })

  describe('review queue', () => {
    let likelyId: string

    it('queues a likely duplicate for review without telling the guest', async () => {
      const result = await submit({ ...OWN_TRANSPORT, full_name: 'Augustin Okafor', contact_email: 'other@example.com', contact_phone: '' })
      // The guest is not told a similar registration exists (a link holder could probe who is coming).
      expect(result.body.data.follow_up).toBe(false)

      const list = await app.call<{ rows: { id: string; duplicate_kind: string }[]; tabs: Record<string, number> }>(
        listSubmissions,
        `/api/intake/submissions?tab=duplicates&search=${result.body.data.reference_code}`,
        { as: coordinator },
      )
      expect(list.status).toBe(200)
      expect(list.body.data.rows).toHaveLength(1)
      expect(list.body.data.tabs.review).toBeGreaterThanOrEqual(1)
      likelyId = list.body.data.rows[0]?.id ?? ''

      const detail = await app.call<{ matched: { delegation_name: string } | null; payload: { full_name: string } }>(
        getSubmission,
        `/api/intake/submissions/${likelyId}`,
        { as: coordinator, params: { id: likelyId } },
      )
      expect(detail.body.data.matched?.delegation_name).toBe('Bishop Augustine Okafor')
      expect(detail.body.data.payload.full_name).toBe('Augustin Okafor')
    })

    it('links it to the existing delegation, once', async () => {
      const [existing] = await app.sql<{ id: string }>(`select id from delegations where name = 'Bishop Augustine Okafor'`)
      const linked = await app.call(link, `/api/intake/submissions/${likelyId}/link`, {
        as: coordinator,
        params: { id: likelyId },
        body: { delegation_id: existing?.id },
      })
      expect(linked.status).toBe(200)
      const again = await app.call(reject, `/api/intake/submissions/${likelyId}/reject`, { as: coordinator, params: { id: likelyId }, body: {} })
      expect(again.status).toBe(409)
      expect(again.body.error?.code).toBe('already_reviewed')
    })

    it('copies only the details the reviewer ticks onto the existing delegation', async () => {
      const result = await submit({
        ...OWN_TRANSPORT,
        full_name: 'Augustine Okafur',
        contact_email: 'protocol@diocese.example',
        contact_phone: '0803 555 0199',
        dietary: 'vegetarian, no pork',
        party: [{ name: 'Chidi Nwosu', role: 'assistant' }, { role: 'security' }],
      })
      const list = await app.call<{ rows: { id: string }[] }>(listSubmissions, `/api/intake/submissions?tab=duplicates&search=${result.body.data.reference_code}`, { as: coordinator })
      const id = list.body.data.rows[0]?.id ?? ''
      const [existing] = await app.sql<{ id: string; contact_email: string; principal_guest_id: string }>(
        `select id, contact_email, principal_guest_id from delegations where name = 'Bishop Augustine Okafor'`,
      )
      const members = () => app.sql<{ full_name: string | null }>(`select full_name from guests where delegation_id = $1 and member_role <> 'principal' order by full_name`, [existing?.id])
      expect(await members()).toEqual([])

      const linked = await app.call<{ applied: string[] }>(link, `/api/intake/submissions/${id}/link`, {
        as: coordinator,
        params: { id },
        body: { delegation_id: existing?.id, apply: ['dietary', 'companions'] },
      })
      expect(linked.status).toBe(200)
      expect(linked.body.data.applied).toEqual(['dietary', 'companions'])

      const [after] = await app.sql<{ contact_email: string; dietary: string[] }>(
        `select d.contact_email, g.dietary from delegations d join guests g on g.id = d.principal_guest_id where d.id = $1`,
        [existing?.id],
      )
      // Contact was not ticked: unchanged. Diet merged; the new companions joined the party.
      expect(after?.contact_email).toBe(existing?.contact_email)
      expect(after?.dietary).toEqual(['Vegetarian', 'No pork'])
      expect(await members()).toEqual([{ full_name: 'Chidi Nwosu' }, { full_name: null }])
    })

    it('keeps the queue to coordinators', async () => {
      expect((await app.call(listSubmissions, '/api/intake/submissions', { as: driver })).status).toBe(403)
      expect((await app.call(listSubmissions, '/api/intake/submissions')).status).toBe(401)
    })
  })

  describe('pasted messages', () => {
    // The second event day, written the way a secretariat would ("21st November").
    const SECOND_DAY = addDays(EVENT_DAY, 1)
    // The message names no year; the reader assumes the event's start year (differs only when the event spans New Year).
    const READ_SECOND_DAY = `${EVENT_DAY.slice(0, 4)}${SECOND_DAY.slice(4)}`
    const MESSAGE = `Good morning. Bishop Emeka Obi arrives on EK 785 on ${spokenDate(SECOND_DAY)} at 2:15pm with his wife and two security men. Vegetarian meals please. Rev Chidi may also join later.`

    it('reads a message without saving it', async () => {
      const before = await app.sql<{ n: number }>('select count(*)::int as n from intake_submissions')
      const result = await app.call<{ fields: Record<string, unknown>; extraction: { method: string } }>(readMessage, '/api/intake/read-message', {
        as: coordinator,
        body: { text: MESSAGE },
      })
      const after = await app.sql<{ n: number }>('select count(*)::int as n from intake_submissions')

      expect(result.status).toBe(200)
      expect(result.body.data.fields).toMatchObject({ title: 'Bishop', full_name: 'Emeka Obi', flight_number: 'EK785', arrival_date: READ_SECOND_DAY, arrival_time: '14:15' })
      expect(result.body.data.extraction.method).toBe('rules')
      expect(after[0]?.n).toBe(before[0]?.n)
    })

    it('saves a draft for review, refuses to approve it incomplete, then approves the corrected form', async () => {
      const created = await app.call<{ id: string; reference_code: string }>(createDraft, '/api/intake/submissions', { as: coordinator, body: { text: MESSAGE } })
      expect(created.status).toBe(201)
      const id = created.body.data.id

      const incomplete = await app.call<unknown>(approve, `/api/intake/submissions/${id}/approve`, { as: coordinator, params: { id }, body: {} })
      expect(incomplete.status).toBe(400)
      expect(incomplete.body.error?.code).toBe('intake_incomplete')

      const fields = {
        title: 'Bishop',
        full_name: 'Emeka Obi',
        contact_name: 'Ada Nwosu',
        contact_phone: '+2348030000001',
        arrival_mode: 'flying',
        airline: 'Emirates',
        flight_number: 'EK785',
        arrival_date: SECOND_DAY,
        arrival_time: '14:15',
        departure_date: EVENT_LAST_DAY,
        others: MESSAGE,
        party: [{ role: 'family' }, { role: 'security' }, { role: 'security' }],
      }
      const saved = await app.call<{ issues: { code: string }[] }>(patchSubmission, `/api/intake/submissions/${id}`, { as: coordinator, params: { id }, body: { fields } })
      expect(saved.status).toBe(200)
      expect(saved.body.data.issues.map((issue) => issue.code)).not.toContain('missing_departure_date')

      const approved = await app.call<{ delegation_id: string; pickup_id: string }>(approve, `/api/intake/submissions/${id}/approve`, { as: coordinator, params: { id }, body: {} })
      expect(approved.status).toBe(201)
      const [audit] = await app.sql<{ actor_type: string; actor_id: string }>(
        `select actor_type, actor_id from audit_log where entity_type = 'delegations' and entity_id = $1`,
        [approved.body.data.delegation_id],
      )
      expect(audit).toEqual({ actor_type: 'user', actor_id: coordinator.id })
      const open = await app.sql<{ detail: string; needs_attention: boolean }>(
        `select r.detail, r.needs_attention from guest_requirements r join guests g on g.id = r.guest_id
         where g.delegation_id = $1 and r.needs_attention`,
        [approved.body.data.delegation_id],
      )
      expect(open.map((item) => item.detail)).toContain('Rev Chidi may also join later.')
    })

    it('rejects a draft with a note', async () => {
      const created = await app.call<{ id: string }>(createDraft, '/api/intake/submissions', { as: coordinator, body: { text: 'Testing testing, please ignore this message.' } })
      const id = created.body.data.id
      const rejected = await app.call(reject, `/api/intake/submissions/${id}/reject`, { as: coordinator, params: { id }, body: { note: 'Not a guest' } })
      expect(rejected.status).toBe(200)
      const [row] = await app.sql<{ status: string; review_note: string; reviewed_by: string }>('select status, review_note, reviewed_by from intake_submissions where id = $1', [id])
      expect(row).toEqual({ status: 'rejected', review_note: 'Not a guest', reviewed_by: coordinator.id })
    })
  })
})
