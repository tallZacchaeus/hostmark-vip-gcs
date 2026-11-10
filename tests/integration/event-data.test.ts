import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { POST as exportData } from '@/app/api/admin/data/export/route'
import { POST as purgeData } from '@/app/api/admin/data/purge/route'
import { EVENT_LAST_DAY, PAST_EVENT } from '@/tests/support/event-dates'
import { type StaffMember, TestApp } from './support/test-app'

// The origin (CSRF) check reads the server settings.
vi.stubEnv('DATABASE_URL', 'pglite://memory')
vi.stubEnv('SERVICE_DATABASE_URL', 'pglite://memory')
vi.stubEnv('BETTER_AUTH_SECRET', 'integration-test-secret-'.padEnd(48, 'x'))
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')

// Super Admin export and post-event purge (PRD §3, TRD §7): roles, the end-date rule, the
// confirmation phrase, the download headers and the audit entries.
describe('event data export and purge API', () => {
  let app: TestApp
  let superAdmin: StaffMember
  let admin: StaffMember
  let coordinator: StaffMember
  let guestId: string

  beforeAll(async () => {
    app = await TestApp.start()
    superAdmin = await app.createStaff('super_admin')
    admin = await app.createStaff('admin')
    coordinator = await app.createStaff('coordinator')
    await app.createEvent()
    const [delegation] = await app.sql<{ id: string }>(`insert into delegations (name, contact_email) values ('Okafor', 'aide@okafor.example') returning id`)
    const [guest] = await app.sql<{ id: string }>(
      `insert into guests (delegation_id, member_role, full_name, phone) values ($1, 'principal', 'Augustine Okafor', '+2348031234567') returning id`,
      [delegation?.id],
    )
    guestId = guest?.id ?? ''
  })
  afterAll(async () => {
    vi.unstubAllEnvs()
    await app.stop()
  })

  describe('export', () => {
    it('is for the Super Admin only', async () => {
      for (const member of [admin, coordinator]) {
        const result = await app.call(exportData, '/api/admin/data/export', { as: member, method: 'POST' })
        expect(result.status).toBe(403)
      }
      const anonymous = await app.call(exportData, '/api/admin/data/export', { method: 'POST' })
      expect(anonymous.status).toBe(401)
    })

    it('is a POST, so a cookie request from another site is refused (CSRF)', async () => {
      const crossSite = await app.call(exportData, '/api/admin/data/export', {
        method: 'POST',
        headers: { cookie: 'better-auth.session_token=stolen', origin: 'https://evil.example' },
      })
      expect(crossSite.status).toBe(403)
      expect(crossSite.body.error?.code).toBe('invalid_origin')
    })

    it('downloads the operational data as a JSON attachment and records the export', async () => {
      const response = await app.rawCall(exportData, '/api/admin/data/export', { as: superAdmin, method: 'POST' })
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')
      expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="annual-summit-export-\d{4}-\d{2}-\d{2}\.json"$/)
      expect(response.headers.get('cache-control')).toBe('no-store')

      const data = (await response.json()) as { guests: { id: string; full_name: string }[]; event: Record<string, unknown> }
      expect(data.guests).toEqual([expect.objectContaining({ id: guestId, full_name: 'Augustine Okafor' })])
      expect(data.event).not.toHaveProperty('intake_token')

      const entries = await app.sql<{ actor_id: string }>(`select actor_id from audit_log where action = 'event.export'`)
      expect(entries).toEqual([{ actor_id: superAdmin.id }])
    })
  })

  describe('purge', () => {
    it('is for the Super Admin only and validates the body', async () => {
      for (const member of [admin, coordinator]) {
        const result = await app.call(purgeData, '/api/admin/data/purge', { as: member, body: { confirmation: 'Annual Summit' } })
        expect(result.status).toBe(403)
      }
      const missing = await app.call(purgeData, '/api/admin/data/purge', { as: superAdmin, body: {} })
      expect(missing.status).toBe(400)
      expect(missing.body.error?.code).toBe('validation_failed')
    })

    it('is refused with 409 before the event has ended', async () => {
      const result = await app.call(purgeData, '/api/admin/data/purge', { as: superAdmin, body: { confirmation: 'Annual Summit' } })
      expect(result.status).toBe(409)
      expect(result.body.error).toMatchObject({ code: 'event_not_ended', details: { ends_on: EVENT_LAST_DAY } })
      expect(result.body.error?.message).toContain('after the event has ended')
      const [guest] = await app.sql<{ full_name: string }>('select full_name from guests where id = $1', [guestId])
      expect(guest?.full_name).toBe('Augustine Okafor')
    })

    it('needs the event name as the confirmation phrase', async () => {
      await app.sql('update events set starts_on = $1, ends_on = $2', [PAST_EVENT.starts_on, PAST_EVENT.ends_on])
      const result = await app.call(purgeData, '/api/admin/data/purge', { as: superAdmin, body: { confirmation: 'Annual' } })
      expect(result.status).toBe(400)
      expect(result.body.error?.code).toBe('confirmation_mismatch')
    })

    it('anonymises guest data after the event and records one event.purge entry', async () => {
      const before = await app.sql<{ max: number }>('select max(id)::int as max from audit_log')
      const result = await app.call<Record<string, number>>(purgeData, '/api/admin/data/purge', {
        as: superAdmin,
        body: { confirmation: 'Annual Summit' },
      })
      expect(result.status).toBe(200)
      expect(result.body.data).toMatchObject({ guests: 1, delegations: 1 })

      const [guest] = await app.sql<{ full_name: string; phone: string | null }>('select full_name, phone from guests where id = $1', [guestId])
      expect(guest).toEqual({ full_name: `Guest ${guestId.slice(0, 8)}`, phone: null })
      const entries = await app.sql<{ action: string; actor_id: string }>('select action, actor_id from audit_log where id > $1', [before[0]?.max ?? 0])
      expect(entries).toEqual([{ action: 'event.purge', actor_id: superAdmin.id }])
      const leaks = await app.sql<{ count: number }>(`select count(*)::int as count from audit_log a where a::text ilike '%okafor%'`)
      expect(leaks[0]?.count).toBe(0)
    })
  })
})
