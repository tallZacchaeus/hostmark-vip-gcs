import { describe, expect, it } from 'vitest'
import { EVENT_DAY, EVENT_LAST_DAY, PAST_EVENT } from '@/tests/support/event-dates'
import { useTestDb } from './support/use-test-db'

// Post-event purge (TRD §7 Privacy) and the Super Admin export (PRD §3): public.purge_guest_data and
// public.export_event_data in db/migrations/20261110120000_event_data_purge.sql.
describe('event data export and purge', () => {
  const db = useTestDb()

  const PAST = { name: 'Annual Summit', ...PAST_EVENT }
  const DAY_ONE = PAST_EVENT.starts_on
  const LAST_DAY = PAST_EVENT.ends_on
  /** Personal values seeded below; none of them may survive the purge anywhere. */
  const SECRETS = ['Okafor', 'Augustine', 'okafor.example', '2348031234567', 'Marina Road', 'Ngozi', 'Allergic', 'wheelchair', 'Ministry of Mines']
  const PERSONAL_TABLES = [
    'guests', 'delegations', 'guest_requirements', 'intake_submissions', 'arrivals', 'pickups', 'proposals',
    'notifications', 'copilot_exchanges', 'room_assignments', 'audit_log',
  ]

  interface Seeded {
    readonly guest: string
    readonly delegation: string
    readonly arrival: string
    readonly pickup: string
    readonly coordinator: string
  }

  async function seed(eventOverrides: Record<string, unknown> = PAST): Promise<Seeded> {
    await db().createEvent(eventOverrides)
    const coordinator = await db().createProfile('coordinator')
    const submission = await db().value<string>(
      `insert into intake_submissions (reference_code, source, payload, normalized, extraction, issues, review_note, client_ip_hash)
       values ('VIP-AB12', 'form',
         '{"full_name": "Augustine Okafor", "contact_email": "aide@okafor.example"}',
         '{"full_name": "Augustine Okafor", "contact_name": "Ngozi Bello", "pickup_address": "12 Marina Road"}',
         '{"items": ["Allergic to nuts"]}',
         '[{"code": "phone_invalid", "field": "contact_phone", "severity": "warning", "message": "+2348031234567 does not look valid"}]',
         'Spoke to Ngozi Bello', 'abc123') returning id`,
    )
    const delegation = await db().value<string>(
      `insert into delegations (name, contact_name, contact_email, contact_phone, notes, created_from_submission_id)
       values ('Okafor', 'Ngozi Bello', 'aide@okafor.example', '+2348031234567', 'Ngozi calls after 6pm', $1) returning id`,
      [submission],
    )
    const arrival = await db().value<string>(
      `insert into arrivals (delegation_id, mode, pickup_address, requested_pickup_at)
       values ($1, 'pickup', '12 Marina Road, Lagos', '${DAY_ONE}T09:00:00Z') returning id`,
      [delegation],
    )
    const guest = await db().value<string>(
      `insert into guests (delegation_id, member_role, full_name, title, organisation, position, arrival_id, dietary, accessibility, phone, email, notes)
       values ($1, 'principal', 'Augustine Okafor', 'Dr', 'Ministry of Mines', 'Minister', $2, '{halal}', 'Needs a wheelchair', '+2348031234567', 'aokafor@okafor.example', 'Prefers Ngozi as interpreter')
       returning id`,
      [delegation, arrival],
    )
    // A later edit, so the audit log holds the personal values in both before and after.
    await db().rows(`update guests set email = 'augustine@okafor.example' where id = $1`, [guest])
    await db().rows(
      `insert into guest_requirements (guest_id, category, detail, source, conflicts_with)
       values ($1, 'dietary', 'Allergic to nuts', 'form', 'Okafor dinner menu')`,
      [guest],
    )
    const pickup = await db().value<string>(
      `insert into pickups (arrival_id, kind, pickup_location, dropoff_location, pickup_at, passenger_count, notes)
       values ($1, 'location', '12 Marina Road, Lagos', 'Grand Hotel', '${DAY_ONE}T09:00:00Z', 2, 'Call Ngozi on arrival') returning id`,
      [arrival],
    )
    const room = await db().createRoom(await db().createRoomType())
    await db().rows(
      `insert into room_assignments (room_id, guest_id, expected_check_in_at, expected_check_out_at, is_manual_override, override_reason)
       values ($1, $2, '${DAY_ONE}T12:00:00Z', '${LAST_DAY}T10:00:00Z', true, 'Augustine Okafor asked for this floor')`,
      [room, guest],
    )
    await db().rows(
      `insert into notifications (recipient_id, kind, title, body)
       values ($1, 'room_changed', 'Augustine Okafor moved to room 101', 'Call +2348031234567'),
              ($1, 'intake_needs_review', 'Registration to review: Ngozi Bello', 'Reference VIP-AB12')`,
      [coordinator],
    )
    await db().rows(
      `insert into copilot_exchanges (user_id, conversation_id, question, transcript_original, engine, intent, tools, answer, citations, latency_ms)
       values ($1, gen_random_uuid(), 'Where is Augustine Okafor?', 'where is augustine okafor', 'rules', 'find_guest',
         '[{"name": "find_guest", "args": {"name": "Okafor"}}]', 'Augustine Okafor lands at 09:00.', '[{"label": "Augustine Okafor"}]', 42)`,
      [coordinator],
    )
    await db().rows(
      `insert into proposals (kind, title, summary, payload, rationale, created_by_type, target_type, target_id, decision_note, status, decided_at)
       values ('copilot_action', 'Add a note to Augustine Okafor', '“Allergic to nuts”',
         jsonb_build_object('action', 'add_note', 'guest_id', $1::text, 'detail', 'Allergic to nuts'),
         '{"why": "Augustine Okafor mentioned it"}', 'copilot', 'guests', $1::uuid, 'Okafor confirmed', 'rejected', now())`,
      [guest],
    )
    return { guest, delegation, arrival, pickup, coordinator }
  }

  const purge = (phrase = 'Annual Summit') => db().value<Record<string, unknown>>('select public.purge_guest_data($1)', [phrase])

  async function asSuperAdmin(): Promise<string> {
    const superAdmin = await db().createProfile('super_admin')
    await db().asUser(superAdmin)
    return superAdmin
  }

  it('anonymises every personal field of guests, delegations, requirements and submissions', async () => {
    const { guest, delegation } = await seed()
    await asSuperAdmin()
    const result = await purge()
    await db().asOwner()

    expect(result).toMatchObject({ guests: 1, delegations: 1 })
    expect(await db().one('select full_name, title, organisation, position, phone, email, accessibility, dietary, notes from guests where id = $1', [guest])).toEqual({
      full_name: `Guest ${guest.slice(0, 8)}`,
      title: null,
      organisation: null,
      position: null,
      phone: null,
      email: null,
      accessibility: null,
      dietary: [],
      notes: null,
    })
    expect(await db().one('select name, contact_name, contact_email, contact_phone, notes from delegations where id = $1', [delegation])).toEqual({
      name: `Delegation ${delegation.slice(0, 8)}`,
      contact_name: null,
      contact_email: null,
      contact_phone: null,
      notes: null,
    })
    expect(await db().one('select category::text, detail, conflicts_with from guest_requirements')).toEqual({ category: 'dietary', detail: '[removed]', conflicts_with: null })
    expect(await db().one('select reference_code, payload, normalized, extraction, issues, review_note, client_ip_hash from intake_submissions')).toEqual({
      reference_code: 'VIP-AB12',
      payload: {},
      normalized: null,
      extraction: null,
      issues: [{ code: 'phone_invalid', field: 'contact_phone', severity: 'warning' }],
      review_note: null,
      client_ip_hash: null,
    })
  })

  it('anonymises addresses, notifications, Co-Pilot exchanges and proposals but keeps the operational records', async () => {
    const { guest, arrival, pickup } = await seed()
    await asSuperAdmin()
    await purge()
    await db().asOwner()
    const alias = `Guest ${guest.slice(0, 8)}`

    expect(await db().one(`select mode::text, pickup_address, to_char(requested_pickup_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as requested_pickup_at from arrivals where id = $1`, [arrival])).toEqual({
      mode: 'pickup',
      pickup_address: '[removed]',
      requested_pickup_at: `${DAY_ONE} 09:00`,
    })
    expect(await db().one(`select pickup_location, dropoff_location, to_char(pickup_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as pickup_at, passenger_count, notes from pickups where id = $1`, [pickup])).toEqual({
      pickup_location: '[removed]',
      dropoff_location: 'Grand Hotel',
      pickup_at: `${DAY_ONE} 09:00`,
      passenger_count: 2,
      notes: null,
    })
    expect(await db().one(`select to_char(expected_check_in_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as expected_check_in_at, is_manual_override, override_reason from room_assignments where guest_id = $1`, [guest])).toEqual({
      expected_check_in_at: `${DAY_ONE} 12:00`,
      is_manual_override: true,
      override_reason: `${alias} asked for this floor`,
    })
    expect(await db().rows('select title, body from notifications order by title')).toEqual([
      { title: `${alias} moved to room 101`, body: null },
      { title: 'Registration to review: [name removed]', body: null },
    ])
    expect(await db().one('select question, transcript_original, answer, tools, citations, intent, latency_ms from copilot_exchanges')).toEqual({
      question: '[removed]',
      transcript_original: null,
      answer: '[removed]',
      tools: [{ name: 'find_guest' }],
      citations: [],
      intent: 'find_guest',
      latency_ms: 42,
    })
    const proposal = await db().one<{ title: string; summary: string | null; payload: Record<string, unknown>; decision_note: string | null }>(
      'select title, summary, payload, decision_note from proposals',
    )
    expect(proposal).toEqual({ title: `Add a note to ${alias}`, summary: null, payload: { action: 'add_note', guest_id: guest }, decision_note: null })
    expect(await db().value<number>('select count(*)::int from guests')).toBe(1)
    expect(await db().value<number>('select count(*)::int from room_assignments')).toBe(1)
  })

  it('leaves no personal value anywhere, including the audit log', async () => {
    await seed()
    await asSuperAdmin()
    await purge()
    await db().asOwner()

    for (const table of PERSONAL_TABLES) {
      for (const secret of SECRETS) {
        const found = await db().value<number>(`select count(*)::int from public.${table} t where t::text ilike $1`, [`%${secret}%`])
        expect(found, `${table} still contains "${secret}"`).toBe(0)
      }
    }
  })

  it('records the purge as one event.purge entry and writes no per-row entries', async () => {
    await seed()
    const before = await db().value<number>('select max(id)::int from audit_log')
    const superAdmin = await asSuperAdmin()
    await purge()
    await db().asOwner()

    const entries = await db().rows<{ action: string; entity_type: string; actor_id: string; actor_type: string }>(
      'select action, entity_type, actor_id, actor_type::text from audit_log where id > $1',
      [before],
    )
    expect(entries).toEqual([{ action: 'event.purge', entity_type: 'events', actor_id: superAdmin, actor_type: 'user' }])
    // The audit triggers are back on afterwards.
    await db().rows(`update guests set notes = 'after purge'`)
    expect(await db().value<number>(`select count(*)::int from audit_log where action = 'guests.update' and id > $1`, [before])).toBe(1)
  })

  it('is for the Super Admin only', async () => {
    await seed()
    for (const role of ['admin', 'coordinator', 'programs'] as const) {
      await db().asUser(await db().createProfile(role))
      expect((await db().expectError(() => purge())).hint).toBe('forbidden')
      await db().asOwner()
    }
    await db().asSystem()
    expect((await db().expectError(() => purge())).code).toBe('42501')
  })

  it('is refused until the event has ended, and without the confirmation phrase', async () => {
    await seed({ name: 'Annual Summit', starts_on: EVENT_DAY, ends_on: EVENT_LAST_DAY })
    await asSuperAdmin()
    const early = await db().expectError(() => purge())
    expect(early.code).toBe('55000')
    expect(early.hint).toBe('event_not_ended')
    await db().asOwner()
    expect(await db().value<string>('select full_name from guests')).toBe('Augustine Okafor')

    await db().rows('update events set starts_on = $1, ends_on = $2', [PAST_EVENT.starts_on, PAST_EVENT.ends_on])
    await asSuperAdmin()
    const wrong = await db().expectError(() => purge('Annual'))
    expect(wrong.hint).toBe('confirmation_mismatch')
    // The phrase is the event name, ignoring case and surrounding spaces.
    expect(await purge('  annual summit ')).toMatchObject({ guests: 1 })
  })

  it('exports the operational data for the Super Admin and records the export', async () => {
    const { guest } = await seed()
    const superAdmin = await asSuperAdmin()
    const data = await db().value<Record<string, unknown>>('select public.export_event_data()')
    await db().asOwner()

    expect(Object.keys(data).sort()).toEqual(
      [
        'arrivals', 'cleaning_tasks', 'delegations', 'drivers', 'event', 'exported_at', 'flights', 'guest_requirements', 'guests',
        'pickup_assignments', 'pickups', 'program_items', 'program_participants', 'room_assignments', 'room_types', 'rooms', 'vip_categories',
      ].sort(),
    )
    expect(data.guests).toEqual([expect.objectContaining({ id: guest, full_name: 'Augustine Okafor' })])
    const text = JSON.stringify(data)
    expect(text).not.toContain('intake_token')
    expect(text).not.toContain('password')
    expect(await db().one(`select action, entity_type, actor_id from audit_log where action = 'event.export'`)).toEqual({
      action: 'event.export',
      entity_type: 'events',
      actor_id: superAdmin,
    })

    await db().asUser(await db().createProfile('admin'))
    expect((await db().expectError(() => db().rows('select public.export_event_data()'))).hint).toBe('forbidden')
  })

  it('redacts names only in free text, word by word, and never touches ids, timestamps, enums or numbers', async () => {
    const { guest, delegation, pickup, coordinator } = await seed()
    // Short and awkward names, as anyone may type them into the public form.
    const short = await db().value<string>(`insert into delegations (name, contact_name) values ('Li', '20') returning id`)
    const del = await db().value<string>(
      `insert into guests (delegation_id, member_role, full_name, share_group) values ($1, 'principal', 'Del Ade', 'Ade family') returning id`,
      [short],
    )
    await db().rows(`update guests set share_group = 'Ade family' where id = $1`, [guest])
    const proposal = await db().value<string>(
      `insert into proposals (kind, title, summary, payload, rationale, created_by_type, target_type, target_id)
       values ('room_assignment', 'Del Ade → room 101', 'Mr Okafor was delivered to Li''s floor; call 0801 234 5678 before 2026-11-20 14:15',
         jsonb_build_object('guest_id', $1::text, 'room_id', $2::text, 'check_in', '2026-11-20T14:00:00.000Z', 'status', 'delivered'),
         jsonb_build_object('why', 'Augustine asked; Del Ade too', 'status', 'delivered', 'score', 0.92, 'guest', jsonb_build_object('name', 'Del Ade', 'delegation', 'Li')),
         'system', 'guests', $1::uuid) returning id`,
      [del, delegation],
    )
    await db().rows(
      `insert into notifications (recipient_id, kind, title) values ($1, 'note', 'Mr Okafor lands 2026-11-20 at 14:15; call 0801-234-5678 or +234 803 123 4567')`,
      [coordinator],
    )
    // Everything that is not free text, before the purge.
    const FIXED = `select a.id, a.action, a.entity_type, a.entity_id, a.occurred_at::text,
        (select jsonb_object_agg(k, v) from jsonb_each(coalesce(a.after, a.before)) as e(k, v)
         where k in ('id', 'event_id', 'delegation_id', 'arrival_id', 'guest_id', 'room_id', 'status', 'kind', 'mode', 'created_at',
                     'pickup_at', 'requested_pickup_at', 'expected_check_in_at', 'passenger_count', 'version', 'member_role', 'category')) as fixed,
        -- A Co-Pilot note's text (payload.detail) is removed on purpose; the rest of the payload stays.
        (coalesce(a.after, a.before) -> 'payload') - 'detail' as payload
      from audit_log a where a.entity_type not in ('guests', 'delegations', 'intake_submissions') and a.action <> 'event.purge' order by a.id`
    const before = await db().rows(FIXED)
    const pickupBefore = await db().one('select pickup_at::text, status::text, arrival_id, passenger_count from pickups where id = $1', [pickup])

    await asSuperAdmin()
    await purge()
    await db().asOwner()

    expect(await db().rows(FIXED)).toEqual(before)
    expect(await db().one('select pickup_at::text, status::text, arrival_id, passenger_count from pickups where id = $1', [pickup])).toEqual(pickupBefore)
    const delAlias = `Guest ${del.slice(0, 8)}`
    const okaforAlias = `Delegation ${delegation.slice(0, 8)}`
    const liAlias = `Delegation ${short.slice(0, 8)}`
    const row = await db().one<{ title: string; summary: string; payload: Record<string, unknown>; rationale: Record<string, unknown> }>(
      'select title, summary, payload, rationale from proposals where id = $1',
      [proposal],
    )
    expect(row.title).toBe(`${delAlias} → room 101`)
    // "Li" is too short to match on its own, and never inside a word ("delivered").
    expect(row.summary).toBe(`Mr ${okaforAlias} was delivered to Li's floor; call [phone removed] before 2026-11-20 14:15`)
    expect(row.payload).toEqual({ guest_id: del, room_id: delegation, check_in: '2026-11-20T14:00:00.000Z', status: 'delivered' })
    expect(row.rationale).toEqual({
      why: `Guest ${guest.slice(0, 8)} asked; ${delAlias} too`,
      status: 'delivered',
      score: 0.92,
      guest: { name: delAlias, delegation: 'Li' },
    })
    expect(liAlias).not.toBe(okaforAlias)
    expect(await db().value<string>(`select title from notifications where kind = 'note'`)).toBe(
      `Mr ${okaforAlias} lands 2026-11-20 at 14:15; call [phone removed] or [phone removed]`,
    )
  })

  it('keeps share groups comparable without their labels, and keeps the venue drop-off', async () => {
    const { guest, delegation, pickup } = await seed()
    const second = await db().value<string>(`insert into guests (delegation_id, full_name, share_group) values ($1, 'Ifeoma Okafor', 'Okafor family') returning id`, [delegation])
    await db().rows(`update guests set share_group = 'Okafor family' where id = $1`, [guest])
    await asSuperAdmin()
    await purge()
    await db().asOwner()

    const groups = await db().rows<{ share_group: string }>('select share_group from guests where id = any($1::uuid[])', [[guest, second]])
    expect(groups[0]?.share_group).toMatch(/^Group [0-9a-f]{8}$/)
    expect(groups[1]?.share_group).toBe(groups[0]?.share_group)
    expect(await db().value<string>('select dropoff_location from pickups where id = $1', [pickup])).toBe('Grand Hotel')
  })

  it('purges a few hundred guests and their history quickly', async () => {
    await seed()
    await db().rows(`insert into delegations (name, contact_name, contact_phone)
      select 'Delegation number ' || n, 'Contact Person' || n, '+23480' || lpad(n::text, 8, '0') from generate_series(1, 150) as n`)
    await db().rows(`insert into guests (delegation_id, full_name, email, notes)
      select d.id, 'Firstname' || g || ' Lastname' || g, 'guest' || g || '@example.org', 'Met Contact Person' || (g % 150 + 1)
      from generate_series(1, 400) as g join lateral (select id from delegations order by created_at, id offset (g % 150) limit 1) d on true`)
    await db().rows(`update guests set notes = notes || ' at the airport' where full_name like 'Firstname%'`)
    expect(await db().value<number>('select count(*)::int from audit_log')).toBeGreaterThan(900)

    await asSuperAdmin()
    const started = performance.now()
    const result = await purge()
    const elapsed = performance.now() - started
    await db().asOwner()

    expect(result).toMatchObject({ guests: 401, delegations: 151 })
    expect(await db().value<number>(`select count(*)::int from audit_log a where a::text ~* 'Firstname|Contact Person|example\\.org'`)).toBe(0)
    expect(elapsed).toBeLessThan(15_000)
  })
})
