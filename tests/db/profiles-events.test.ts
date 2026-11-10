import { describe, expect, it } from 'vitest'
import { useTestDb } from './support/use-test-db'

describe('profiles', () => {
  const db = useTestDb()

  it('lets staff below coordinator read only their own profile', async () => {
    const driver = await db().createProfile('driver')
    await db().createProfile('coordinator')
    await db().asUser(driver)

    const ids = await db().rows<{ id: string }>('select id from profiles')
    expect(ids.map((row) => row.id)).toEqual([driver])
  })

  it("lets coordinators read every profile on their event's team", async () => {
    await db().createEvent()
    const coordinator = await db().createProfile('coordinator')
    await db().createProfile('driver')
    await db().createProfile('housekeeping')
    await db().asUser(coordinator)

    expect(await db().value<number>('select count(*)::int from profiles')).toBe(3)
  })

  it('treats a banned account as having no role', async () => {
    const banned = await db().createProfile('coordinator', { banned: true })
    await db().createProfile('driver')
    await db().asUser(banned)

    expect(await db().value('select private.current_app_role()')).toBeNull()
    const ids = await db().rows<{ id: string }>('select id from profiles')
    expect(ids.map((row) => row.id)).toEqual([banned])
  })

  it('lets an admin change the role of staff below admin', async () => {
    await db().createEvent()
    const admin = await db().createProfile('admin')
    const driver = await db().createProfile('driver')
    await db().asUser(admin)

    const updated = await db().rows(`update profiles set role = 'coordinator' where id = $1 returning role`, [driver])
    expect(updated).toEqual([{ role: 'coordinator' }])
  })

  it('stops an admin from promoting anyone to admin', async () => {
    await db().createEvent()
    const admin = await db().createProfile('admin')
    const coordinator = await db().createProfile('coordinator')
    await db().asUser(admin)

    const error = await db().expectError(() =>
      db().rows(`update profiles set role = 'admin' where id = $1`, [coordinator]),
    )
    expect(error.code).toBe('42501')
  })

  it('stops an admin from changing a super admin', async () => {
    const admin = await db().createProfile('admin')
    const superAdmin = await db().createProfile('super_admin')
    await db().asUser(admin)

    const updated = await db().rows(`update profiles set full_name = 'Changed' where id = $1 returning id`, [superAdmin])
    expect(updated).toEqual([])
  })

  it('lets a super admin promote someone to admin', async () => {
    const superAdmin = await db().createProfile('super_admin')
    const coordinator = await db().createProfile('coordinator')
    await db().asUser(superAdmin)

    const updated = await db().rows(`update profiles set role = 'admin' where id = $1 returning role`, [coordinator])
    expect(updated).toEqual([{ role: 'admin' }])
  })

  it('never leaves the system without an active super admin', async () => {
    const superAdmin = await db().createProfile('super_admin')
    await db().asUser(superAdmin)

    const demote = await db().expectError(() =>
      db().rows(`update profiles set role = 'admin' where id = $1`, [superAdmin]),
    )
    expect(demote.hint).toBe('last_super_admin')

    const ban = await db().expectError(() =>
      db().rows(`update profiles set banned = true where id = $1`, [superAdmin]),
    )
    expect(ban.hint).toBe('last_super_admin')
  })

  it('allows demoting a super admin when another one is active', async () => {
    const first = await db().createProfile('super_admin')
    await db().createProfile('super_admin')
    await db().asUser(first)

    const updated = await db().rows(`update profiles set role = 'admin' where id = $1 returning role`, [first])
    expect(updated).toEqual([{ role: 'admin' }])
  })

  it('does not let the API change an email address directly', async () => {
    const superAdmin = await db().createProfile('super_admin')
    const driver = await db().createProfile('driver')
    await db().asUser(superAdmin)

    const error = await db().expectError(() =>
      db().rows(`update profiles set email = 'new@example.com' where id = $1`, [driver]),
    )
    expect(error.code).toBe('42501')
  })

  it('clears the forced password change flag for the signed-in user only', async () => {
    const user = await db().createProfile('driver', { must_change_password: true })
    const other = await db().createProfile('driver', { must_change_password: true })
    await db().asUser(user)
    await db().rows('select public.complete_password_change()')
    await db().asOwner()

    const flags = await db().rows<{ id: string; must_change_password: boolean }>(
      'select id, must_change_password from profiles where id = any($1::uuid[])',
      [[user, other]],
    )
    expect(Object.fromEntries(flags.map((row) => [row.id, row.must_change_password]))).toEqual({
      [user]: false,
      [other]: true,
    })
  })
})

describe('events', () => {
  const db = useTestDb()

  it('lets a Programme Manager create an event and blocks admins and coordinators (P9 step 9.4)', async () => {
    const manager = await db().createProfile('programme_manager')
    const admin = await db().createProfile('admin')
    const coordinator = await db().createProfile('coordinator')
    const insert = () => db().rows(`insert into events (name, venue_name, starts_on, ends_on) values ('A', 'B', '2026-11-20', '2026-11-21')`)

    for (const blockedRole of [coordinator, admin]) {
      await db().asOwner()
      await db().asUser(blockedRole)
      const blocked = await db().expectError(insert)
      expect(blocked.code).toBe('42501')
    }

    await db().asOwner()
    await db().asUser(manager)
    const created = await db().rows(`insert into events (name, venue_name, starts_on, ends_on)
      values ('Summit', 'Grand Hotel', '2026-11-20', '2026-11-23') returning name`)
    expect(created).toEqual([{ name: 'Summit' }])
  })

  it('hides the events table from staff screens but exposes the safe context', async () => {
    await db().createEvent({ timezone: 'Africa/Lagos' })
    const driver = await db().createProfile('driver')
    const programs = await db().createProfile('programs')

    await db().asUser(programs)
    expect(await db().value<number>('select count(*)::int from events')).toBe(1)

    await db().asUser(driver)
    expect(await db().value<number>('select count(*)::int from events')).toBe(0)
    const context = await db().value<Record<string, unknown>>('select public.get_event_context()')
    expect(context).toMatchObject({ name: 'Annual Summit', timezone: 'Africa/Lagos', flight_mode: 'simulated' })
    expect(context).not.toHaveProperty('intake_token')
  })

  it('lets admins set the coordination desk phone and every staff member read it from the context', async () => {
    await db().createEvent()
    const admin = await db().createProfile('admin')
    const coordinator = await db().createProfile('coordinator')
    const driver = await db().createProfile('driver')

    await db().asUser(coordinator)
    expect(await db().rows(`update events set coordinator_phone = '+2348035550142' returning id`)).toEqual([])

    await db().asUser(admin)
    const updated = await db().rows(`update events set coordinator_phone = '+2348035550142' returning coordinator_phone`)
    expect(updated).toEqual([{ coordinator_phone: '+2348035550142' }])

    await db().asUser(driver)
    expect(await db().value<number>('select count(*)::int from events')).toBe(0)
    const context = await db().value<Record<string, unknown>>('select public.get_event_context()')
    expect(context).toMatchObject({ coordinator_phone: '+2348035550142' })
    expect(context).not.toHaveProperty('intake_token')
  })

  it('keeps the coordination desk phone in international format', async () => {
    const badPhone = await db().expectError(() => db().createEvent({ coordinator_phone: '0803 555 0142' }))
    expect(badPhone.code).toBe('23514')

    await db().createEvent()
    await db().asUser(await db().createProfile('driver'))
    expect(await db().value('select public.get_event_context() ->> \'coordinator_phone\'')).toBeNull()
  })

  it('refuses the event context without a signed-in user', async () => {
    await db().createEvent()
    await db().asAnonymous()
    const error = await db().expectError(() => db().rows('select public.get_event_context()'))
    expect(error.code).toBe('42501')
  })

  it('lets only admins regenerate the intake link', async () => {
    const eventId = await db().createEvent()
    const original = await db().value<string>('select intake_token from events where id = $1', [eventId])
    const admin = await db().createProfile('admin')
    const coordinator = await db().createProfile('coordinator')

    await db().asUser(coordinator)
    const blocked = await db().expectError(() => db().rows('select public.regenerate_intake_token()'))
    expect(blocked.code).toBe('42501')

    await db().asUser(admin)
    const token = await db().value<string>('select public.regenerate_intake_token()')
    expect(token).toMatch(/^[0-9a-f]{32}$/)
    expect(token).not.toBe(original)
  })

  it('does not let the API write the intake token directly', async () => {
    await db().createEvent()
    const admin = await db().createProfile('admin')
    await db().asUser(admin)
    const error = await db().expectError(() => db().rows(`update events set intake_token = 'guessable'`))
    expect(error.code).toBe('42501')
  })

  it('reserves the flight data mode for super admins', async () => {
    await db().createEvent()
    const admin = await db().createProfile('admin')
    const superAdmin = await db().createProfile('super_admin')

    await db().asUser(admin)
    const blocked = await db().expectError(() => db().rows(`update events set flight_mode = 'live'`))
    expect(blocked.code).toBe('42501')

    await db().asUser(superAdmin)
    const updated = await db().rows(`update events set flight_mode = 'live' returning flight_mode`)
    expect(updated).toEqual([{ flight_mode: 'live' }])
  })

  it('keeps an admin from creating the event in live flight mode', async () => {
    const admin = await db().createProfile('admin')
    await db().asUser(admin)
    const error = await db().expectError(() =>
      db().rows(`insert into events (name, venue_name, starts_on, ends_on, flight_mode)
        values ('A', 'B', '2026-11-20', '2026-11-21', 'live')`),
    )
    expect(error.code).toBe('42501')
  })

  it('validates the timezone, airport codes and date order', async () => {
    const badTimezone = await db().expectError(() => db().createEvent({ timezone: 'Mars/Base' }))
    expect(badTimezone.code).toBe('23514')

    const badAirport = await db().expectError(() => db().createEvent({ arrival_airports: ['LOS', 'abuja'] }))
    expect(badAirport.code).toBe('23514')

    const badDates = await db().expectError(() =>
      db().createEvent({ starts_on: '2026-11-23', ends_on: '2026-11-20' }),
    )
    expect(badDates.code).toBe('23514')
  })
})
