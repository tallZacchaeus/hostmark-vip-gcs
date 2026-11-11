import { describe, expect, it } from 'vitest'
import { useTestDb } from './support/use-test-db'

describe('guests and intake (P2 migration)', () => {
  const db = useTestDb()

  async function createDelegation(name = 'Bishop A. Okafor'): Promise<{ delegation: string; guest: string; arrival: string }> {
    const delegation = await db().value<string>(`insert into delegations (name) values ($1) returning id`, [name])
    const arrival = await db().value<string>(
      `insert into arrivals (delegation_id, mode, stated_arrival_at) values ($1, 'own_transport', now()) returning id`,
      [delegation],
    )
    const guest = await db().value<string>(
      `insert into guests (delegation_id, member_role, full_name, arrival_id) values ($1, 'principal', 'Augustine Okafor', $2) returning id`,
      [delegation, arrival],
    )
    await db().rows('update delegations set principal_guest_id = $2 where id = $1', [delegation, guest])
    return { delegation, guest, arrival }
  }

  it('lets coordinators write guests, the front desk and programmes team read them, and hides them from others', async () => {
    await db().createEvent()
    const coordinator = await db().createProfile('coordinator')
    await db().asUser(coordinator)
    await createDelegation()

    const visible: Record<string, number> = {}
    for (const role of ['programs', 'accommodation', 'driver', 'housekeeping'] as const) {
      await db().asOwner()
      const user = await db().createProfile(role)
      await db().asUser(user)
      visible[role] = await db().value<number>('select count(*)::int from guests')
    }
    expect(visible).toEqual({ programs: 1, accommodation: 1, driver: 0, housekeeping: 0 })

    const writeAttempt = await db().expectError(() => db().rows(`insert into delegations (name) values ('Someone')`))
    expect(writeAttempt.code).toBe('42501')
  })

  it('only accepts pasted-message drafts from coordinators and only lets them change review columns', async () => {
    await db().createEvent()
    const coordinator = await db().createProfile('coordinator')
    await db().asUser(coordinator)

    const form = await db().expectError(() =>
      db().rows(`insert into intake_submissions (reference_code, source, payload) values ('VIP-AAAA', 'form', '{}')`),
    )
    expect(form.code).toBe('42501')
    const id = await db().value<string>(
      `insert into intake_submissions (reference_code, source, payload, status) values ('VIP-BBBB', 'pasted_message', '{"text":"hi"}', 'needs_review') returning id`,
    )
    const rewrite = await db().expectError(() => db().rows(`update intake_submissions set payload = '{}' where id = $1`, [id]))
    expect(rewrite.code).toBe('42501')
    await db().rows(`update intake_submissions set status = 'rejected', review_note = 'Spam' where id = $1`, [id])

    await db().asOwner()
    const programs = await db().createProfile('programs')
    await db().asUser(programs)
    expect(await db().value<number>('select count(*)::int from intake_submissions')).toBe(0)
  })

  it('keeps the rate-limit table and the link lookup to the trusted server role', async () => {
    const eventId = await db().createEvent({ intake_open: true })
    const token = await db().value<string>('select intake_token from events where id = $1', [eventId])
    const admin = await db().createProfile('admin')

    await db().asUser(admin)
    expect((await db().expectError(() => db().rows('select * from intake_rate_limits'))).code).toBe('42501')
    expect((await db().expectError(() => db().rows('select public.intake_link_context($1)', [token]))).code).toBe('42501')

    await db().asSystem()
    const context = await db().value<Record<string, unknown>>('select public.intake_link_context($1)', [token])
    expect(context).toMatchObject({ open: true, timezone: 'Africa/Lagos', intake_window_days: 3 })
    expect(context).not.toHaveProperty('intake_token')
    expect(await db().value('select public.intake_link_context($1)', ['not-a-token'])).toBeNull()
  })

  it('requires the fields of the arrival mode', async () => {
    await db().createEvent()
    const delegation = await db().value<string>(`insert into delegations (name) values ('X') returning id`)
    const pickup = await db().expectError(() =>
      db().rows(`insert into arrivals (delegation_id, mode, pickup_address) values ($1, 'pickup', 'Ikoyi')`, [delegation]),
    )
    expect(pickup.code).toBe('23514')
    const flying = await db().expectError(() => db().rows(`insert into arrivals (delegation_id, mode) values ($1, 'flying')`, [delegation]))
    expect(flying.code).toBe('23514')
  })

  it('allows one live pickup per arrival and bumps versions on update', async () => {
    await db().createEvent()
    const { arrival, guest } = await createDelegation()
    await db().rows(`insert into pickups (arrival_id, kind, pickup_location, pickup_at, passenger_count) values ($1, 'location', 'Ikoyi', now(), 1)`, [arrival])
    const second = await db().expectError(() =>
      db().rows(`insert into pickups (arrival_id, kind, pickup_location, pickup_at, passenger_count) values ($1, 'location', 'Ikoyi', now(), 1)`, [arrival]),
    )
    expect(second.code).toBe('23505')

    await db().rows(`update guests set notes = 'Prefers a quiet room' where id = $1`, [guest])
    expect(await db().value('select version from guests where id = $1', [guest])).toBe(2)
  })

  it('audits guest changes and lets the guest-intake actor be recorded by the server', async () => {
    await db().createEvent()
    await db().asSystem()
    await db().rows(`select private.set_audit_context(p_actor_type => 'guest_intake', p_is_automatic => true)`)
    const { delegation } = await createDelegation()
    const entry = await db().one<{ actor_type: string; is_automatic: boolean; undoable: boolean }>(
      `select actor_type, is_automatic, undoable from audit_log where entity_type = 'delegations' and entity_id = $1 and action like '%insert%'`,
      [delegation],
    )
    expect(entry).toEqual({ actor_type: 'guest_intake', is_automatic: true, undoable: true })
  })
})
