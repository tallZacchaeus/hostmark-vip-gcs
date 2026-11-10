import { describe, expect, it } from 'vitest'
import { eventTime } from '@/tests/support/event-dates'
import { useTestDb } from './support/use-test-db'

// Event in Africa/Lagos (UTC+1), lead time 30 minutes. The briefing starts 17:00 local (16:00Z).
const STARTS = eventTime(0, '16:00:00Z')
const ENDS = eventTime(0, '17:00:00Z')

describe('event programme (P6 migration)', () => {
  const db = useTestDb()

  interface Arranged {
    readonly item: string
    readonly guest: string
    readonly arrival: string
    readonly programs: string
    readonly coordinator: string
  }

  /** A published briefing with one speaker whose party is expected at the venue at `expected`. */
  async function arrange(expected: string, status = 'published'): Promise<Arranged> {
    await db().createEvent()
    const programs = await db().createProfile('programs')
    const coordinator = await db().createProfile('coordinator')
    const delegation = await db().value<string>(`insert into delegations (name) values ('Okafor') returning id`)
    const arrival = await db().value<string>(
      `insert into arrivals (delegation_id, mode, stated_arrival_at, expected_at_venue_at) values ($1, 'own_transport', $2, $2) returning id`,
      [delegation, expected],
    )
    const guest = await db().value<string>(
      `insert into guests (delegation_id, arrival_id, member_role, title, full_name) values ($1, $2, 'principal', 'Bishop', 'Augustine Okafor') returning id`,
      [delegation, arrival],
    )
    await db().asUser(programs)
    const item = await db().value<string>(
      `insert into program_items (title, kind, starts_at, ends_at, location, status) values ('Welcome briefing', 'session', $1, $2, 'Conference hall A', $3) returning id`,
      [STARTS, ENDS, status],
    )
    await db().rows(`insert into program_participants (program_item_id, guest_id, role) values ($1, $2, 'speaker')`, [item, guest])
    await db().asOwner()
    return { item, guest, arrival, programs, coordinator }
  }

  const atRisk = (item: string) => db().value<boolean>('select at_risk from program_items where id = $1', [item])
  const riskNotes = () =>
    db().rows<{ role: string; title: string }>(
      `select p.role::text as role, n.title from notifications n join profiles p on p.id = n.recipient_id where n.kind = 'program_at_risk' order by p.role`,
    )

  it('flags an item when a participant is expected after the start minus the lead time, and tells programs and coordinators', async () => {
    const { item } = await arrange(eventTime(0, '15:55:00Z'))

    expect(await atRisk(item)).toBe(true)
    expect(await riskNotes()).toEqual([
      { role: 'coordinator', title: 'Welcome briefing at risk: Bishop Augustine Okafor expected 16:55' },
      { role: 'programs', title: 'Welcome briefing at risk: Bishop Augustine Okafor expected 16:55' },
    ])
    expect(await db().rows('select guest_id, full_name from private.program_item_risks($1)', [item])).toEqual([
      expect.objectContaining({ full_name: 'Bishop Augustine Okafor' }),
    ])
  })

  it('is on track when the participant arrives in time (lead time included)', async () => {
    const { item } = await arrange(eventTime(0, '15:20:00Z'))

    expect(await atRisk(item)).toBe(false)
    expect(await riskNotes()).toEqual([])
  })

  it('re-checks when the arrival moves, and clears the flag when the conflict is gone', async () => {
    const { item, arrival } = await arrange(eventTime(0, '15:00:00Z'))
    expect(await atRisk(item)).toBe(false)

    // The flight cascade moves the expected time at the venue.
    await db().rows(`update arrivals set expected_at_venue_at = '${eventTime(0, '15:50:00Z')}' where id = $1`, [arrival])
    expect(await atRisk(item)).toBe(true)
    expect(await riskNotes()).toHaveLength(2)

    await db().rows(`update arrivals set expected_at_venue_at = '${eventTime(0, '15:10:00Z')}' where id = $1`, [arrival])
    expect(await atRisk(item)).toBe(false)
  })

  it('re-checks when the item moves, and ignores participants who have arrived or cancelled', async () => {
    const { item, guest, programs } = await arrange(eventTime(0, '15:55:00Z'))
    expect(await atRisk(item)).toBe(true)

    await db().asUser(programs)
    await db().rows(`update program_items set starts_at = '${eventTime(0, '17:00:00Z')}', ends_at = '${eventTime(0, '18:00:00Z')}' where id = $1`, [item])
    await db().asOwner()
    expect(await atRisk(item)).toBe(false)

    await db().asUser(programs)
    await db().rows(`update program_items set starts_at = $2, ends_at = $3 where id = $1`, [item, STARTS, ENDS])
    await db().asOwner()
    expect(await atRisk(item)).toBe(true)
    await db().rows(`update guests set status = 'arrived' where id = $1`, [guest])
    expect(await atRisk(item)).toBe(false)
  })

  it('flags drafts quietly and notifies when an at-risk draft is published', async () => {
    const { item, programs } = await arrange(eventTime(0, '15:55:00Z'), 'draft')
    expect(await atRisk(item)).toBe(true)
    expect(await riskNotes()).toEqual([])

    await db().asUser(programs)
    await db().rows(`update program_items set status = 'published' where id = $1`, [item])
    await db().asOwner()
    expect(await riskNotes()).toHaveLength(2)
  })

  it('lets programs and admins edit, shows coordinators the published programme only, and nobody else', async () => {
    const { item, coordinator } = await arrange(eventTime(0, '15:00:00Z'))
    await db().asUser(coordinator)
    const draft = await db().expectError(() =>
      db().rows(`insert into program_items (title, kind, starts_at, ends_at, location) values ('Draft', 'meal', $1, $2, 'Hall')`, [STARTS, ENDS]),
    )
    expect(draft.code).toBe('42501')
    expect(await db().value<number>('select count(*)::int from program_items')).toBe(1)
    expect(await db().value<number>('select count(*)::int from program_participants')).toBe(1)
    await db().asOwner()

    const admin = await db().createProfile('admin')
    await db().asUser(admin)
    await db().rows(`insert into program_items (title, kind, starts_at, ends_at, location) values ('Dinner plan', 'meal', $1, $2, 'Banquet hall')`, [STARTS, ENDS])
    expect(await db().value<number>('select count(*)::int from program_items')).toBe(2)
    await db().asOwner()
    await db().asUser(coordinator)
    expect(await db().value<number>('select count(*)::int from program_items')).toBe(1)
    await db().asOwner()

    for (const role of ['accommodation', 'housekeeping', 'driver'] as const) {
      await db().asUser(await db().createProfile(role))
      expect(await db().value<number>('select count(*)::int from program_items')).toBe(0)
      await db().asOwner()
    }
    await db().asUser(coordinator)
    const write = await db().expectError(() => db().rows(`update program_items set at_risk = false where id = $1`, [item]))
    expect(write.code).toBe('42501')
  })

  it('refuses an item that ends before it starts', async () => {
    const { programs } = await arrange(eventTime(0, '15:00:00Z'))
    await db().asUser(programs)
    const bad = await db().expectError(() =>
      db().rows(`insert into program_items (title, kind, starts_at, ends_at, location) values ('Backwards', 'other', $2, $1, 'Hall')`, [STARTS, ENDS]),
    )
    expect(bad.code).toBe('23514')
  })

  it('re-checks every item when an admin changes the lead time, alerting once and clearing by itself', async () => {
    // Expected 15:20Z; the briefing starts 16:00Z. On track with 30 minutes, at risk with 60.
    const { item, coordinator } = await arrange(eventTime(0, '15:20:00Z'))
    expect(await atRisk(item)).toBe(false)
    const admin = await db().createProfile('admin')
    const setLeadTime = async (minutes: number) => {
      await db().asUser(admin)
      await db().rows('update events set program_lead_time_min = $1', [minutes])
      await db().asOwner()
    }

    await setLeadTime(60)
    expect(await atRisk(item)).toBe(true)
    expect(await riskNotes()).toEqual(
      ['admin', 'coordinator', 'programs'].map((role) => ({ role, title: 'Welcome briefing at risk: Bishop Augustine Okafor expected 16:20' })),
    )
    await db().asUser(coordinator)
    await db().rows('select public.notify_program_risk($1)', [item])
    await db().asOwner()

    // Still at risk: no second alert. Back on track: the flag and "team notified" clear.
    await setLeadTime(90)
    expect(await riskNotes()).toHaveLength(3)
    await setLeadTime(30)
    expect(await db().one('select at_risk, risk_notified_at from program_items where id = $1', [item])).toEqual({ at_risk: false, risk_notified_at: null })
  })

  it('leaves the flag alone when other event settings change', async () => {
    const { item } = await arrange(eventTime(0, '15:20:00Z'))
    // Forced out of step to show that only a lead-time change re-checks.
    await db().rows('update program_items set at_risk = true where id = $1', [item])
    await db().rows(`update events set delay_threshold_min = 20, program_lead_time_min = program_lead_time_min`)
    expect(await atRisk(item)).toBe(true)
  })

  it('lets a coordinator notify the programs team about an at-risk item', async () => {
    const { item, coordinator } = await arrange(eventTime(0, '15:55:00Z'))
    await db().asUser(coordinator)
    await db().rows('select public.notify_program_risk($1)', [item])
    await db().asOwner()

    expect(await db().value('select risk_notified_by from program_items where id = $1', [item])).toBe(coordinator)
    expect(await db().value<number>(`select count(*)::int from notifications where kind = 'program_risk_flagged'`)).toBe(1)

    // Once per risk: a second alert is refused, and the "notified" mark clears with the risk.
    await db().asUser(coordinator)
    expect((await db().expectError(() => db().rows('select public.notify_program_risk($1)', [item]))).hint).toBe('already_notified')
    await db().asOwner()
    await db().rows(`update arrivals set expected_at_venue_at = '${eventTime(0, '15:00:00Z')}'`)
    expect(await db().one('select at_risk, risk_notified_at from program_items where id = $1', [item])).toEqual({ at_risk: false, risk_notified_at: null })
  })
})
