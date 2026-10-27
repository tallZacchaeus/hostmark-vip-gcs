import { describe, expect, it } from 'vitest'
import { useTestDb } from './support/use-test-db'

describe('Co-Pilot (P7 migration)', () => {
  const db = useTestDb()

  async function arrange(): Promise<{ guest: string; coordinator: string }> {
    await db().createEvent()
    const delegation = await db().value<string>(`insert into delegations (name) values ('Okafor') returning id`)
    const guest = await db().value<string>(`insert into guests (delegation_id, member_role, full_name) values ($1, 'principal', 'Augustine Okafor') returning id`, [delegation])
    return { guest, coordinator: await db().createProfile('coordinator') }
  }

  const proposeNote = (guest: string) =>
    db().value<string>(
      `select public.copilot_propose('copilot_action', jsonb_build_object('action', 'add_note', 'guest_id', $1::text, 'detail', 'Prefers a quiet room'), 'Add a note to Augustine Okafor', null, 'guests', $1::uuid)`,
      [guest],
    )

  it('turns a Co-Pilot note into a proposal; nothing is written until a coordinator approves', async () => {
    const { guest, coordinator } = await arrange()
    await db().asUser(coordinator)
    const id = await proposeNote(guest)
    await db().asOwner()

    expect(await db().one('select kind::text, status::text, created_by_type::text, created_by from proposals where id = $1', [id])).toEqual({
      kind: 'copilot_action',
      status: 'pending',
      created_by_type: 'copilot',
      created_by: coordinator,
    })
    expect(await db().value<number>('select count(*)::int from guest_requirements')).toBe(0)

    await db().asUser(coordinator)
    expect(await db().value('select public.approve_proposal($1)', [id])).toMatchObject({ status: 'approved' })
    await db().asOwner()
    expect(await db().one('select category::text, detail, source from guest_requirements where guest_id = $1', [guest])).toEqual({
      category: 'other',
      detail: 'Prefers a quiet room',
      source: 'coordinator',
    })
  })

  it('lets only coordinators and above ask the Co-Pilot to propose', async () => {
    const { guest } = await arrange()
    for (const role of ['programs', 'accommodation', 'driver'] as const) {
      await db().asUser(await db().createProfile(role))
      expect((await db().expectError(() => proposeNote(guest))).hint).toBe('forbidden')
      await db().asOwner()
    }
  })

  it('accepts only the agreed actions', async () => {
    const { guest, coordinator } = await arrange()
    await db().asUser(coordinator)
    const plan = await db().expectError(() => db().rows(`select public.copilot_propose('room_plan', '{}'::jsonb, 'Plan', null, 'guests', $1::uuid)`, [guest]))
    expect(plan.hint).toBe('invalid_action')
    const note = await db().expectError(() => db().rows(`select public.copilot_propose('copilot_action', '{"action":"drop_table"}'::jsonb, 'Bad', null, 'guests', $1::uuid)`, [guest]))
    expect(note.hint).toBe('invalid_action')
    // The target must be the guest the payload acts on.
    const mismatched = await db().expectError(() =>
      db().rows(`select public.copilot_propose('copilot_action', jsonb_build_object('action', 'add_note', 'guest_id', gen_random_uuid()::text, 'detail', 'x'), 'Bad', null, 'guests', $1::uuid)`, [guest]),
    )
    expect(mismatched.hint).toBe('invalid_action')
  })

  it('fails a note for a guest who is gone, safely', async () => {
    const { guest, coordinator } = await arrange()
    await db().asUser(coordinator)
    const id = await proposeNote(guest)
    await db().asOwner()
    await db().rows('delete from guests where id = $1', [guest])

    await db().asUser(coordinator)
    expect(await db().value('select public.approve_proposal($1)', [id])).toMatchObject({ status: 'failed', error: 'guest_gone' })
  })

  it('logs exchanges per user: own rows only (admins see all), never on behalf of someone else', async () => {
    const { coordinator } = await arrange()
    const other = await db().createProfile('coordinator')
    const admin = await db().createProfile('admin')
    const log = (user: string) =>
      db().rows(`insert into copilot_exchanges (conversation_id, question, input_mode, engine, intent, tools, answer, latency_ms) values (gen_random_uuid(), 'Who lands next?', 'text', 'rules', 'find_arrivals', '[]', 'Nobody.', 12)`).then(() => user)

    await db().asUser(coordinator)
    await log(coordinator)
    await db().asOwner()
    await db().asUser(other)
    expect(await db().value<number>('select count(*)::int from copilot_exchanges')).toBe(0)
    const forged = await db().expectError(() =>
      db().rows(`insert into copilot_exchanges (user_id, conversation_id, question, input_mode, engine, answer, latency_ms) values ($1, gen_random_uuid(), 'x', 'text', 'rules', 'y', 1)`, [coordinator]),
    )
    expect(forged.code).toBe('42501')
    await db().asOwner()
    await db().asUser(admin)
    expect(await db().value<number>('select count(*)::int from copilot_exchanges')).toBe(1)
    await db().asOwner()

    await db().asUser(await db().createProfile('programs'))
    expect((await db().expectError(() => log('programs'))).code).toBe('42501')
  })
})
