import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GET as listRooms } from '@/app/api/admin/rooms/route'
import { seedDevData } from '@/db/tooling/seed'
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
    const result = await seedDevData(app.db, app.auth, password, { now: new Date('2026-10-16T09:00:00Z') })
    expect(result).toMatchObject({ startsOn: '2026-11-15', rooms: 120, drivers: 15, guests: { delegations: 6, queued: 3 } })
    expect(result.accounts).toHaveLength(7)

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

    // Seed data is recorded as system activity that cannot be undone.
    const [undoable] = await app.sql<{ n: number }>(`select count(*)::int as n from audit_log where undoable`)
    expect(undoable?.n).toBe(0)
  })

  it('refuses to run twice', async () => {
    await expect(seedDevData(app.db, app.auth, password)).rejects.toThrow(/already has an event/)
  })
})
