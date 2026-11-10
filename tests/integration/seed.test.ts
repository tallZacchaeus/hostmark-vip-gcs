import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GET as listRooms } from '@/app/api/admin/rooms/route'
import { seedDevData } from '@/db/tooling/seed'
import { EVENT_DAY, addDays } from '@/tests/support/event-dates'
import { TestApp } from './support/test-app'

describe('development seed', () => {
  let app: TestApp
  const password = 'Seeded-Pass-2026'

  beforeAll(async () => {
    app = await TestApp.start()
  })
  afterAll(async () => {
    await app.stop()
  })

  it('creates a usable venue, drivers and one account per role', async () => {
    // Seeded as of the start of today: the demo event starts 30 days later.
    const today = addDays(EVENT_DAY, -10)
    const result = await seedDevData(app.db, app.auth, password, { now: new Date(`${today}T00:00:00Z`) })
    expect(result).toMatchObject({ startsOn: addDays(today, 30), rooms: 120, drivers: 15, guests: { delegations: 6, queued: 3 } })
    expect(result.accounts).toHaveLength(8)
    const [event] = await app.sql<{ status: string; owner: string; members: number }>(
      `select e.status, p.email as owner, (select count(*)::int from event_members m where m.event_id = e.id) as members
       from events e join profiles p on p.id = e.owner_id`,
    )
    expect(event).toEqual({ status: 'live', owner: 'programme.manager@vipgcs.test', members: 7 })

    const [shifts] = await app.sql<{ n: number }>('select count(*)::int as n from driver_shifts')
    expect(shifts?.n).toBe(15 * 4)

    const [linked] = await app.sql<{ email: string }>(
      'select p.email from drivers d join profiles p on p.id = d.profile_id',
    )
    expect(linked?.email).toBe('driver@vipgcs.test')

    // Seeded accounts sign in and see data through the API (RLS applies).
    const token = await app.signIn('coordinator@vipgcs.test', password)
    const rooms = await app.call<unknown[]>(listRooms, '/api/admin/rooms?limit=200', {
      as: { id: '', email: 'coordinator@vipgcs.test', password, token, role: 'coordinator' },
    })
    expect(rooms.body.meta).toMatchObject({ total: 120 })

    // The Figma room grid: x01–x07 West, x08–x14 East, x15–x20 Garden.
    const wings = await app.sql<{ number: string; wing: string }>(
      `select number, wing from rooms where number in ('101', '108', '615', '620') order by number`,
    )
    expect(wings).toEqual([
      { number: '101', wing: 'West' },
      { number: '108', wing: 'East' },
      { number: '615', wing: 'Garden' },
      { number: '620', wing: 'Garden' },
    ])

    // Demo guests go through the real record builder: flights, pickups and a review queue.
    const [counts] = await app.sql<{ flights: number; pickups: number; review: number; likely: number }>(
      `select (select count(*)::int from flights) as flights, (select count(*)::int from pickups) as pickups,
        (select count(*)::int from intake_submissions where status = 'needs_review') as review,
        (select count(*)::int from intake_submissions where duplicate_kind = 'likely') as likely`,
    )
    expect(counts).toEqual({ flights: 4, pickups: 5, review: 3, likely: 2 })

    // Transport goes through the real pipeline: ET512 is late, its driver (the driver login) keeps
    // the trip and must confirm the new time; the matcher suggests drivers for the rest.
    expect(result.transport.assigned).toBe(2)
    expect(result.transport.suggestions).toBeGreaterThanOrEqual(1)
    const [moved] = await app.sql<{ email: string; moved: boolean; acknowledged: boolean }>(
      `select p.email, pk.previous_pickup_at is not null as moved, pa.acknowledged_at is not null as acknowledged
       from pickup_assignments pa join pickups pk on pk.id = pa.pickup_id join arrivals a on a.id = pk.arrival_id
       join flights f on f.id = a.flight_id join drivers d on d.id = pa.driver_id join profiles p on p.id = d.profile_id
       where f.flight_number = 'ET512'`,
    )
    expect(moved).toEqual({ email: 'driver@vipgcs.test', moved: true, acknowledged: false })
    const [pending] = await app.sql<{ n: number }>(`select count(*)::int as n from proposals where status = 'pending' and kind = 'driver_assignment'`)
    expect(pending?.n).toBe(result.transport.suggestions)

    // Rooms go through the real allocator: every room state is on the grid and a plan for every
    // seeded guest is waiting for approval, none of it in a room that is out of service.
    const [states] = await app.sql<{ dirty: number; cleaning: number; broken: number }>(
      `select count(*) filter (where housekeeping_status = 'needs_cleaning')::int as dirty,
        count(*) filter (where housekeeping_status = 'cleaning')::int as cleaning, count(*) filter (where out_of_service)::int as broken from rooms`,
    )
    expect(states).toEqual({ dirty: 3, cleaning: 2, broken: 1 })
    // The programme (P6): every item seeded, and the welcome briefing flagged by the delayed ET512 party.
    const [briefing] = await app.sql<{ at_risk: boolean; count: number }>(
      `select at_risk, (select count(*)::int from program_items) as count from program_items where id = $1`,
      [result.programme.briefingId],
    )
    expect(briefing).toEqual({ at_risk: true, count: result.programme.items })
    // Each dirty or cleaning room has its task, so Sanitation agrees with the rooms grid (P5).
    const tasks = await app.sql<{ status: string; count: number }>(`select status::text, count(*)::int from cleaning_tasks group by status order by status`)
    expect(tasks).toEqual([
      { status: 'in_progress', count: 2 },
      { status: 'pending', count: 3 },
    ])
    const [plan] = await app.sql<{ status: string; lines: number; guests: number; in_broken: number }>(
      `select p.status, (select count(*)::int from proposals l where l.parent_id = p.id) as lines,
        (select count(*)::int from guests where status in ('expected', 'arrived')) as guests,
        (select count(*)::int from proposals l join rooms r on r.id = (l.payload ->> 'room_id')::uuid where l.parent_id = p.id and r.out_of_service) as in_broken
       from proposals p where p.id = $1 and p.kind = 'room_plan'`,
      [result.allocation.planId],
    )
    expect(plan).toMatchObject({ status: 'pending', in_broken: 0 })
    expect(plan?.lines).toBe(result.allocation.placed)
    expect(result.allocation.placed + result.allocation.unplaced).toBe(plan?.guests)

    // Seed data is recorded as system activity that cannot be undone.
    const [undoable] = await app.sql<{ n: number }>(`select count(*)::int as n from audit_log where undoable`)
    expect(undoable?.n).toBe(0)
  })

  it('refuses to run twice', async () => {
    await expect(seedDevData(app.db, app.auth, password)).rejects.toThrow(/already has an event/)
  })
})
