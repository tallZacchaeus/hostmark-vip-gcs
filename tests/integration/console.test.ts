import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GET as listAudit } from '@/app/api/audit/route'
import { GET as summary } from '@/app/api/dashboard/summary/route'
import { type StaffMember, TestApp } from './support/test-app'

interface Summary {
  rooms: { total: number; ready: number; needs_cleaning: number; cleaning: number; out_of_service: number }
  decisions_pending: number
  guests: { guests: number; delegations: number }
  arrivals_today: { total: number; flying: number; by_road: number }
  pickups_today: { total: number; needs_driver: number }
  intake_to_review: number
  programme_at_risk: unknown[]
}

describe('console API: dashboard summary and activity filters', () => {
  let app: TestApp
  let coordinator: StaffMember
  let driver: StaffMember

  beforeAll(async () => {
    app = await TestApp.start()
    await app.createEvent()
    coordinator = await app.createStaff('coordinator')
    driver = await app.createStaff('driver')
    const [type] = await app.sql<{ id: string }>(
      `insert into room_types (name, tier, default_capacity, cleaning_minutes) values ('Suite', 1, 2, 45) returning id`,
    )
    await app.sql(
      `insert into rooms (number, floor, wing, room_type_id, housekeeping_status, out_of_service) values
        ('101', 1, 'West', $1, 'clean', false), ('102', 1, 'West', $1, 'clean', false),
        ('103', 1, 'West', $1, 'needs_cleaning', false), ('104', 1, 'West', $1, 'cleaning', false),
        ('105', 1, 'West', $1, 'clean', true)`,
      [type?.id],
    )
    await app.sql(
      `select private.create_proposal(p_kind => 'driver_assignment', p_title => 'Assign a driver', p_payload => '{}'::jsonb,
         p_created_by_type => 'system', p_target_type => 'pickups', p_target_id => gen_random_uuid())`,
    )
    await app.sql(
      `select private.create_proposal(p_kind => 'driver_assignment', p_title => 'Old', p_payload => '{}'::jsonb,
         p_created_by_type => 'system', p_target_type => 'pickups', p_target_id => gen_random_uuid(),
         p_expires_at => now() - interval '1 minute')`,
    )
  })
  afterAll(async () => {
    await app.stop()
  })

  it('counts rooms by readiness and open, unexpired decisions', async () => {
    const result = await app.call<Summary>(summary, '/api/dashboard/summary', { as: coordinator })

    expect(result.status).toBe(200)
    expect(result.body.data).toEqual({
      rooms: { total: 5, ready: 2, needs_cleaning: 1, cleaning: 1, out_of_service: 1 },
      decisions_pending: 1,
      guests: { guests: 0, delegations: 0 },
      arrivals_today: { total: 0, flying: 0, by_road: 0 },
      pickups_today: { total: 0, needs_driver: 0 },
      intake_to_review: 0,
      programme_at_risk: [],
    })
  })

  it('keeps the dashboard to coordinators and above', async () => {
    const result = await app.call(summary, '/api/dashboard/summary', { as: driver })
    expect(result.status).toBe(403)
  })

  it('filters activity by actor type and by several entity types', async () => {
    const system = await app.call<Array<{ actor_type: string }>>(listAudit, '/api/audit?actor_type=system&limit=200', { as: coordinator })
    expect(system.status).toBe(200)
    expect(system.body.data.length).toBeGreaterThan(0)
    expect(system.body.data.every((entry) => entry.actor_type === 'system')).toBe(true)

    const tables = await app.call<Array<{ entity_type: string }>>(listAudit, '/api/audit?entity_types=rooms,room_types&limit=200', {
      as: coordinator,
    })
    expect(new Set(tables.body.data.map((entry) => entry.entity_type))).toEqual(new Set(['rooms', 'room_types']))
  })

  it('rejects an invalid entity type list', async () => {
    const result = await app.call(listAudit, '/api/audit?entity_types=rooms,DROP%20TABLE', { as: coordinator })
    expect(result.status).toBe(400)
    expect(result.body.error?.code).toBe('validation_failed')
  })
})
