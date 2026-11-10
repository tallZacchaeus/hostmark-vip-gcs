import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { POST as chat } from '@/app/api/copilot/chat/route'
import { POST as approve } from '@/app/api/proposals/[id]/approve/route'
import { seedDevData } from '@/db/tooling/seed'
import type { CopilotReply } from '@/lib/copilot/engine'
import { type StaffMember, TestApp } from './support/test-app'

vi.stubEnv('DATABASE_URL', 'pglite://memory')
vi.stubEnv('SERVICE_DATABASE_URL', 'pglite://memory')
vi.stubEnv('BETTER_AUTH_SECRET', 'integration-test-secret-'.padEnd(48, 'x'))
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')

const PASSWORD = 'Seeded-Pass-2026'
const DAY_MS = 86_400_000
// 08:00 in Lagos (07:00 UTC) on an event day still ahead, as in `pnpm eval:copilot`. The Co-Pilot
// reads the app's clock while the programme risk check reads Postgres's own now(); a day in the
// future keeps both agreeing that the day's items are upcoming, whatever time the suite runs.
const MORNING = new Date(`${new Date(Date.now() + DAY_MS).toISOString().slice(0, 10)}T07:00:00Z`)

describe('Co-Pilot on the demo data', () => {
  let app: TestApp
  let coordinator: StaffMember

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(MORNING)
    app = await TestApp.start()
    // The event starts "today" on the fixed clock, as in `pnpm local:setup`.
    await seedDevData(app.db, app.auth, PASSWORD, { now: MORNING, startsInDays: 0 })
    const staff = (email: string, role: StaffMember['role']) => app.signIn(email, PASSWORD).then((token) => ({ id: '', email, password: PASSWORD, token, role }))
    coordinator = await staff('coordinator@vipgcs.test', 'coordinator')
    const [row] = await app.sql<{ id: string }>(`select id from profiles where email = 'coordinator@vipgcs.test'`)
    coordinator = { ...coordinator, id: row?.id ?? '' }
  })
  afterAll(async () => {
    await app.stop()
    vi.useRealTimers()
  })

  const ask = async (message: string, as: StaffMember = coordinator) => app.call<CopilotReply>(chat, '/api/copilot/chat', { as, body: { message } })

  it('answers questions from live data, with links to the records used', async () => {
    const arrivals = (await ask('Who is arriving today?')).body.data
    expect(arrivals).toMatchObject({ intent: 'find_arrivals', proposal: null })
    expect(arrivals.answer).toMatch(/Okafor/)
    expect(arrivals.citations.some((citation) => citation.href.startsWith('/guests/'))).toBe(true)

    const flight = (await ask('What is the status of ET512?')).body.data
    expect(flight).toMatchObject({ intent: 'get_flight_status' })
    expect(flight.answer).toMatch(/^ET512 .*late.*Moyo/)

    const guest = (await ask('Where is Dr Eze staying?')).body.data
    expect(guest).toMatchObject({ intent: 'get_guest' })
    expect(guest.answer).toMatch(/Ngozi Eze/)

    const programme = (await ask('Is any programme item at risk?')).body.data
    expect(programme.answer).toMatch(/Welcome briefing/)

    expect((await ask('Tell me a joke')).body.data).toMatchObject({ intent: 'help' })
  })

  it('prepares changes as proposals and writes nothing until a coordinator approves', async () => {
    const before = await app.sql<{ n: number }>(`select count(*)::int as n from guest_requirements where detail = 'Allergic to peanuts'`)
    const reply = (await ask('Add a note to Dr Eze: Allergic to peanuts')).body.data

    expect(reply).toMatchObject({ intent: 'add_note', proposal: { title: 'Add a note to Dr Ngozi Eze' } })
    expect(reply.answer).toMatch(/Nothing changes until you approve it/)
    expect(await app.sql<{ n: number }>(`select count(*)::int as n from guest_requirements where detail = 'Allergic to peanuts'`)).toEqual(before)
    const [proposal] = await app.sql<{ status: string; created_by_type: string }>(`select status, created_by_type from proposals where id = $1`, [reply.proposal?.id])
    expect(proposal).toEqual({ status: 'pending', created_by_type: 'copilot' })

    const id = reply.proposal?.id ?? ''
    expect((await app.call<{ status: string }>(approve, `/api/proposals/${id}/approve`, { as: coordinator, params: { id }, body: {} })).body.data.status).toBe('approved')
    expect(await app.sql<{ n: number }>(`select count(*)::int as n from guest_requirements where detail = 'Allergic to peanuts'`)).toEqual([{ n: (before[0]?.n ?? 0) + 1 }])
  })

  it('prepares a room move without moving anyone', async () => {
    const stays = () => app.sql<{ room_id: string }>(`select ra.room_id from room_assignments ra join guests g on g.id = ra.guest_id where g.full_name = 'Ngozi Eze' and ra.status in ('planned', 'checked_in')`)
    const before = await stays()
    const reply = (await ask('Move Dr Eze to room 305')).body.data

    expect(reply).toMatchObject({ intent: 'propose_room_move', proposal: { title: 'Move Dr Ngozi Eze to room 305' } })
    expect(await stays()).toEqual(before)
  })

  it('asks instead of guessing, and logs every exchange for its user', async () => {
    expect((await ask('Move John Smith to room 305')).body.data).toMatchObject({ intent: 'clarify', proposal: null })

    const logged = await app.sql<{ n: number; voice: number }>(`select count(*)::int as n, count(*) filter (where input_mode = 'voice')::int as voice from copilot_exchanges where user_id = $1`, [coordinator.id])
    // Five questions, the note, the room move and the clarification above.
    expect(logged[0]?.n).toBe(8)
    const voice = await app.call<CopilotReply>(chat, '/api/copilot/chat', { as: coordinator, body: { message: 'Who lands in the next 2 hours?', input_mode: 'voice', transcript_original: 'who lands in the next to hours' } })
    expect(voice.status).toBe(200)
    const [row] = await app.sql<{ transcript_original: string }>(`select transcript_original from copilot_exchanges where input_mode = 'voice'`)
    expect(row?.transcript_original).toBe('who lands in the next to hours')
  })

  it('is for coordinators and above only', async () => {
    const programs = { id: '', email: 'programs@vipgcs.test', password: PASSWORD, token: await app.signIn('programs@vipgcs.test', PASSWORD), role: 'programs' as const }
    expect((await ask('Who is arriving today?', programs)).status).toBe(403)
    expect((await app.call(chat, '/api/copilot/chat', { as: coordinator, body: { message: '' } })).status).toBe(400)
  })
})
