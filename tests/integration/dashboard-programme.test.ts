import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { GET as summary } from '@/app/api/dashboard/summary/route'
import { getSystemDb, withSystem } from '@/lib/db/system'
import type { FlightSnapshot } from '@/lib/flights/provider'
import type { ProgrammeRisk } from '@/lib/repositories/dashboard'
import { ingestFlightUpdate } from '@/lib/services/flights/ingest'
import { type FlightParty, addFlightParty } from './support/transport-fixture'
import { type StaffMember, TestApp } from './support/test-app'

vi.stubEnv('DATABASE_URL', 'pglite://memory')
vi.stubEnv('SERVICE_DATABASE_URL', 'pglite://memory')
vi.stubEnv('BETTER_AUTH_SECRET', 'integration-test-secret-'.padEnd(48, 'x'))
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')

// The event starts two days after the real date. The dashboard reads "today" from the app clock,
// pinned to 09:00 in Lagos on that day; Postgres's own now() (used by the risk check) stays real and
// so earlier than the event, which keeps the items upcoming whenever the suite runs.
const DAY_MS = 86_400_000
const dayAhead = (days: number): string => new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10)
const EVENT_DAY = dayAhead(2)
const LAST_DAY = dayAhead(5)
const MORNING = new Date(`${EVENT_DAY}T08:00:00Z`)
const LANDS = `${EVENT_DAY}T12:00:00Z`

interface Summary {
  programme_at_risk: ProgrammeRisk[]
}

const snapshot = (estimated: string): FlightSnapshot => ({
  phase: 'in_air',
  scheduled_arrival_at: LANDS,
  estimated_arrival_at: estimated,
  actual_arrival_at: null,
  origin_iata: 'DXB',
  destination_iata: 'LOS',
})

describe('dashboard summary: programme items at risk today', () => {
  let app: TestApp
  let coordinator: StaffMember
  let party: FlightParty

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(MORNING)
    app = await TestApp.start()
    coordinator = await app.createStaff('coordinator')
  })
  afterAll(async () => {
    await app.stop()
    vi.useRealTimers()
  })

  const read = async () => (await app.call<Summary>(summary, '/api/dashboard/summary', { as: coordinator })).body.data

  it('lists nothing before the event is set up', async () => {
    expect((await read()).programme_at_risk).toEqual([])
  })

  it('lists today’s published items that a late arrival puts at risk, with who is late', async () => {
    await app.createEvent()
    await app.sql(`update events set starts_on = $1, ends_on = $2`, [EVENT_DAY, LAST_DAY])
    party = await addFlightParty(app, { delegation: 'Okafor', flight_number: 'EK783', scheduled_arrival_at: LANDS, passengers: 1 })
    await app.sql(`update flights set arrival_date_local = $1 where id = $2`, [EVENT_DAY, party.flight_id])
    const [guest] = await app.sql<{ id: string }>(`select id from guests where delegation_id = $1 limit 1`, [party.delegation_id])
    const items = await app.sql<{ id: string; title: string }>(
      `insert into program_items (title, kind, starts_at, ends_at, location, status) values
         ('Welcome briefing', 'session', $1, $2, 'Conference hall A', 'published'),
         ('Draft rehearsal', 'session', $1, $2, 'Conference hall B', 'draft'),
         ('Evening reception', 'ceremony', $3, $4, 'Banquet hall', 'published')
       returning id, title`,
      [`${EVENT_DAY}T14:30:00Z`, `${EVENT_DAY}T15:30:00Z`, `${EVENT_DAY}T19:00:00Z`, `${EVENT_DAY}T21:00:00Z`],
    )
    for (const item of items) {
      await app.sql(`insert into program_participants (program_item_id, guest_id, role) values ($1, $2, 'speaker')`, [item.id, guest?.id])
    }
    expect((await read()).programme_at_risk).toEqual([])

    await withSystem(getSystemDb(), { actor: 'system', action: 'flights.update' }, (tx) =>
      ingestFlightUpdate(tx, { flight_id: party.flight_id, snapshot: snapshot(`${EVENT_DAY}T13:15:00Z`), source: 'simulated', observed_at: new Date() }),
    )

    const risks = (await read()).programme_at_risk
    const briefing = items.find((item) => item.title === 'Welcome briefing')
    expect(risks).toEqual([
      {
        id: briefing?.id,
        title: 'Welcome briefing',
        starts_at: `${EVENT_DAY}T14:30:00.000Z`,
        location: 'Conference hall A',
        late: [{ guest_id: guest?.id, name: expect.any(String), expected_at: expect.stringMatching(new RegExp(`^${EVENT_DAY}T\\d\\d:\\d\\d:00\\.000Z$`)) }],
      },
    ])
  })

  it('lists nothing on another day', async () => {
    vi.setSystemTime(MORNING.getTime() + DAY_MS)
    expect((await read()).programme_at_risk).toEqual([])
    vi.setSystemTime(MORNING)
  })
})
