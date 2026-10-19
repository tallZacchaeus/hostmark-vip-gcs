import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { POST as authPost } from '@/app/api/auth/[...all]/route'
import { resolveActor } from '@/lib/auth/session'
import { BASE_URL, TestApp } from './support/test-app'

describe('authentication against the real schema', () => {
  let app: TestApp

  beforeAll(async () => {
    app = await TestApp.start()
  })
  afterAll(async () => {
    await app.stop()
  })

  it('creates an account in profiles with the requested role and a hashed password', async () => {
    const coordinator = await app.createStaff('coordinator', { name: 'Ada Lovelace' })
    const [profile] = await app.sql('select full_name, role, banned from profiles where id = $1', [coordinator.id])
    expect(profile).toEqual({ full_name: 'Ada Lovelace', role: 'coordinator', banned: false })

    const [account] = await app.sql<{ provider_id: string; password: string }>(
      'select provider_id, password from auth_accounts where user_id = $1',
      [coordinator.id],
    )
    expect(account?.provider_id).toBe('credential')
    expect(account?.password).not.toContain(coordinator.password)
  })

  it('signs in over HTTP and returns a bearer token', async () => {
    const driver = await app.createStaff('driver')
    const response = await authPost(
      new Request(`${BASE_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: BASE_URL },
        body: JSON.stringify({ email: driver.email, password: driver.password }),
      }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('set-auth-token')).toBeTruthy()
  })

  it('rejects a wrong password', async () => {
    const driver = await app.createStaff('driver')
    await expect(app.signIn(driver.email, 'Wrong-Password-1')).rejects.toThrow()
  })

  it('resolves the signed-in staff member from a bearer token', async () => {
    const housekeeping = await app.createStaff('housekeeping', { mustChangePassword: true })
    const resolution = await resolveActor(new Headers({ authorization: `Bearer ${housekeeping.token}` }))
    expect(resolution).toEqual({
      status: 'active',
      actor: expect.objectContaining({ id: housekeeping.id, role: 'housekeeping', mustChangePassword: true }),
    })
  })

  it('treats a banned account as inactive and anonymous requests as anonymous', async () => {
    const banned = await app.createStaff('coordinator', { banned: true })
    expect(await resolveActor(new Headers({ authorization: `Bearer ${banned.token}` }))).toEqual({ status: 'inactive' })
    expect(await resolveActor(new Headers())).toEqual({ status: 'anonymous' })
  })

  it('does not expose sign-up or the admin plugin over HTTP', async () => {
    const signUp = await authPost(
      new Request(`${BASE_URL}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: BASE_URL },
        body: JSON.stringify({ email: 'new@example.com', password: 'Some-Password-1', name: 'New' }),
      }),
    )
    expect(signUp.status).toBe(404)

    const setRole = await authPost(
      new Request(`${BASE_URL}/api/auth/admin/set-role`, { method: 'POST', body: '{}' }),
    )
    expect(setRole.status).toBe(404)
  })
})
