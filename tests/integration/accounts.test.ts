import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { POST as changePassword } from '@/app/api/account/password/route'
import { GET as me } from '@/app/api/me/route'
import { GET as getUser, PATCH as patchUser } from '@/app/api/admin/users/[id]/route'
import { POST as resetPassword } from '@/app/api/admin/users/[id]/reset-password/route'
import { GET as listUsers, POST as createUser } from '@/app/api/admin/users/route'
import { GET as listRooms } from '@/app/api/admin/rooms/route'
import { type StaffMember, TestApp } from './support/test-app'

interface CreatedAccount {
  account: { id: string; email: string; role: string; active: boolean; must_change_password: boolean; phone: string | null }
  temporary_password: string
}

describe('staff accounts API', () => {
  let app: TestApp
  let superAdmin: StaffMember
  let admin: StaffMember
  let coordinator: StaffMember

  beforeAll(async () => {
    app = await TestApp.start()
    await app.createEvent()
    superAdmin = await app.createStaff('super_admin')
    admin = await app.createStaff('admin')
    coordinator = await app.createStaff('coordinator')
  })
  afterAll(async () => {
    await app.stop()
  })

  async function createAccount(as: StaffMember, body: Record<string, unknown>) {
    return app.call<CreatedAccount>(createUser, '/api/admin/users', { as, body })
  }

  it('lets an admin create a driver account with a one-time temporary password', async () => {
    const result = await createAccount(admin, {
      email: '  Tunde.Driver@Example.com ',
      full_name: 'Tunde Bakare',
      role: 'driver',
      phone: '+2348012345678',
    })
    expect(result.status).toBe(201)
    const { account, temporary_password: password } = result.body.data
    expect(account).toMatchObject({
      email: 'tunde.driver@example.com',
      role: 'driver',
      active: true,
      must_change_password: true,
      phone: '+2348012345678',
    })
    expect(password).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{14}$/)

    const audit = await app.sql<{ action: string; actor_id: string }>(
      `select action, actor_id from audit_log where entity_id = $1 order by id`,
      [account.id],
    )
    expect(audit[0]).toEqual({ action: 'profiles.create', actor_id: admin.id })
  })

  it('forces a new account to change its temporary password before doing anything else', async () => {
    const created = await createAccount(admin, { email: 'new.housekeeper@example.com', full_name: 'New Housekeeper', role: 'housekeeping' })
    const { account, temporary_password: password } = created.body.data
    const token = await app.signIn(account.email, password)
    const newcomer: StaffMember = { id: account.id, email: account.email, password, token, role: 'housekeeping' }

    const meResult = await app.call<{ user: { must_change_password: boolean }; home_route: string }>(me, '/api/me', { as: newcomer })
    expect(meResult.body.data).toMatchObject({ user: { must_change_password: true }, home_route: '/staff/sanitation' })

    const blocked = await app.call(listRooms, '/api/admin/rooms', { as: newcomer })
    expect(blocked.status).toBe(403)
    expect(blocked.body.error?.code).toBe('password_change_required')

    const weak = await app.call(changePassword, '/api/account/password', {
      as: newcomer,
      body: { current_password: password, new_password: 'weakpass' },
    })
    expect(weak.status).toBe(400)

    const changed = await app.call<{ password_changed: boolean; token: string | null }>(changePassword, '/api/account/password', {
      as: newcomer,
      body: { current_password: password, new_password: 'Brand-New-Pass-77' },
    })
    expect(changed.status).toBe(200)
    expect(changed.body.data.password_changed).toBe(true)

    const freshToken = changed.body.data.token ?? (await app.signIn(account.email, 'Brand-New-Pass-77'))
    const allowed = await app.call(listRooms, '/api/admin/rooms', { as: { ...newcomer, token: freshToken } })
    expect(allowed.status).toBe(200)
  })

  it('rejects the wrong current password', async () => {
    const result = await app.call(changePassword, '/api/account/password', {
      as: coordinator,
      body: { current_password: 'Not-My-Password-1', new_password: 'Another-Pass-99' },
    })
    expect(result.status).toBe(400)
    expect(result.body.success).toBe(false)
  })

  it('keeps admins from creating or managing admin accounts', async () => {
    const promote = await createAccount(admin, { email: 'second.admin@example.com', full_name: 'Second Admin', role: 'admin' })
    expect(promote.status).toBe(403)

    const touchSuper = await app.call(patchUser, `/api/admin/users/${superAdmin.id}`, {
      as: admin,
      method: 'PATCH',
      params: { id: superAdmin.id },
      body: { full_name: 'Renamed' },
    })
    expect(touchSuper.status).toBe(403)

    const bySuper = await createAccount(superAdmin, { email: 'second.admin@example.com', full_name: 'Second Admin', role: 'admin' })
    expect(bySuper.status).toBe(201)
  })

  it('does not let coordinators manage accounts', async () => {
    const result = await app.call(listUsers, '/api/admin/users', { as: coordinator })
    expect(result.status).toBe(403)
  })

  it('reports duplicate emails and invalid input clearly', async () => {
    const duplicate = await createAccount(admin, { email: coordinator.email, full_name: 'Copy', role: 'driver' })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.error?.code).toBe('already_exists')

    const invalid = await createAccount(admin, { email: 'not-an-email', full_name: '', role: 'pilot', extra: true })
    expect(invalid.status).toBe(400)
    expect(invalid.body.error?.code).toBe('validation_failed')
  })

  it('lists accounts with filters and pagination', async () => {
    const result = await app.call<Array<{ role: string }>>(listUsers, '/api/admin/users?role=coordinator&limit=5', { as: admin })
    expect(result.status).toBe(200)
    expect(result.body.data.every((account) => account.role === 'coordinator')).toBe(true)
    expect(result.body.meta).toMatchObject({ page: 1, limit: 5 })
  })

  it('deactivates an account, signing it out, and refuses self-deactivation', async () => {
    const driver = await app.createStaff('driver')
    const deactivated = await app.call<{ active: boolean; deactivation_reason: string }>(patchUser, `/api/admin/users/${driver.id}`, {
      as: admin,
      method: 'PATCH',
      params: { id: driver.id },
      body: { active: false, deactivation_reason: 'Left the event team' },
    })
    expect(deactivated.status).toBe(200)
    expect(deactivated.body.data).toMatchObject({ active: false, deactivation_reason: 'Left the event team' })

    const afterwards = await app.call(me, '/api/me', { as: driver })
    expect([401, 403]).toContain(afterwards.status)
    await expect(app.signIn(driver.email, driver.password)).rejects.toThrow()

    const self = await app.call(patchUser, `/api/admin/users/${admin.id}`, {
      as: admin,
      method: 'PATCH',
      params: { id: admin.id },
      body: { active: false },
    })
    expect(self.status).toBe(409)
    expect(self.body.error?.code).toBe('cannot_change_own_access')
  })

  it('resets a password to a new temporary one', async () => {
    const driver = await app.createStaff('driver')
    const reset = await app.call<{ temporary_password: string }>(resetPassword, `/api/admin/users/${driver.id}/reset-password`, {
      as: admin,
      params: { id: driver.id },
    })
    expect(reset.status).toBe(200)
    await expect(app.signIn(driver.email, driver.password)).rejects.toThrow()

    const token = await app.signIn(driver.email, reset.body.data.temporary_password)
    const result = await app.call<{ user: { must_change_password: boolean } }>(me, '/api/me', { as: { ...driver, token } })
    expect(result.body.data.user.must_change_password).toBe(true)
  })

  it('returns 404 for an unknown account id', async () => {
    const id = crypto.randomUUID()
    const result = await app.call(getUser, `/api/admin/users/${id}`, { as: admin, params: { id } })
    expect(result.status).toBe(404)
  })
})
