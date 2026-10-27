import { describe, expect, it } from 'vitest'
import { useTestDb } from './support/use-test-db'

const CREATE_PROPOSAL = `select private.create_proposal(
  p_kind => $4::public.proposal_kind, p_title => $1, p_payload => '{}'::jsonb,
  p_created_by_type => 'system', p_target_type => 'pickups', p_target_id => $2::uuid,
  p_expires_at => $3::timestamptz)`

describe('proposals', () => {
  const db = useTestDb()

  async function createProposal(title: string, targetId: string, expiresAt: string | null = null, kind = 'driver_assignment'): Promise<string> {
    await db().asSystem()
    const id = await db().value<string>(CREATE_PROPOSAL, [title, targetId, expiresAt, kind])
    await db().asOwner()
    return id
  }

  it('notifies every active coordinator, admin and super admin', async () => {
    await db().createEvent()
    const coordinator = await db().createProfile('coordinator')
    const admin = await db().createProfile('admin')
    await db().createProfile('coordinator', { banned: true })
    await db().createProfile('driver')

    const proposal = await createProposal('Assign driver to EK783', crypto.randomUUID())
    const recipients = await db().rows<{ recipient_id: string }>(
      `select recipient_id from notifications where entity_id = $1 order by recipient_id`,
      [proposal],
    )
    expect(recipients.map((row) => row.recipient_id).sort()).toEqual([coordinator, admin].sort())
  })

  it('supersedes an older pending proposal for the same target', async () => {
    await db().createEvent()
    const target = crypto.randomUUID()
    const first = await createProposal('Assign driver A', target)
    const second = await createProposal('Assign driver B', target)

    const rows = await db().rows<{ id: string; status: string; superseded_by: string | null }>(
      'select id, status, superseded_by from proposals order by created_at, title',
    )
    expect(rows).toEqual([
      { id: first, status: 'superseded', superseded_by: second },
      { id: second, status: 'pending', superseded_by: null },
    ])
  })

  it('supersedes the pending lines of a superseded plan too, and not undoably', async () => {
    await db().createEvent()
    const target = crypto.randomUUID()
    const first = await createProposal('Plan A', target)
    await db().rows(
      `insert into proposals (parent_id, kind, title, created_by_type) values ($1, 'room_assignment', 'Line 1', 'system')`,
      [first],
    )
    const second = await createProposal('Plan B', target)

    const line = await db().one('select status, superseded_by from proposals where parent_id = $1', [first])
    expect(line).toEqual({ status: 'superseded', superseded_by: second })
    const undoable = await db().value<number>(
      `select count(*)::int from audit_log where action = 'proposals.supersede' and undoable`,
    )
    expect(undoable).toBe(0)
  })

  it('is readable by coordinators only and cannot be written directly', async () => {
    await db().createEvent()
    await createProposal('Assign driver', crypto.randomUUID())
    const coordinator = await db().createProfile('coordinator')
    const driver = await db().createProfile('driver')

    await db().asUser(driver)
    expect(await db().value<number>('select count(*)::int from proposals')).toBe(0)

    await db().asUser(coordinator)
    expect(await db().value<number>('select count(*)::int from proposals')).toBe(1)
    const error = await db().expectError(() => db().rows(`update proposals set status = 'approved'`))
    expect(error.code).toBe('42501')
  })

  it('rejects a proposal and records who decided', async () => {
    await db().createEvent()
    const proposal = await createProposal('Assign driver', crypto.randomUUID())
    const coordinator = await db().createProfile('coordinator')
    await db().asUser(coordinator)

    const result = await db().value('select public.reject_proposal($1, $2)', [proposal, 'Driver is off sick'])
    expect(result).toEqual({ id: proposal, status: 'rejected' })
    const row = await db().one('select status, decided_by, decision_note from proposals where id = $1', [proposal])
    expect(row).toEqual({ status: 'rejected', decided_by: coordinator, decision_note: 'Driver is off sick' })

    const again = await db().expectError(() => db().rows('select public.reject_proposal($1)', [proposal]))
    expect(again.hint).toBe('not_pending')
  })

  it('does not let staff below coordinator decide', async () => {
    await db().createEvent()
    const proposal = await createProposal('Assign driver', crypto.randomUUID())
    const driver = await db().createProfile('driver')
    await db().asUser(driver)
    const error = await db().expectError(() => db().rows('select public.reject_proposal($1)', [proposal]))
    expect(error.code).toBe('42501')
  })

  it('fails a Co-Pilot action whose payload it cannot carry out, and writes nothing (P7 executor)', async () => {
    await db().createEvent()
    const proposal = await createProposal('Add a note', crypto.randomUUID(), null, 'copilot_action')
    const coordinator = await db().createProfile('coordinator')
    await db().asUser(coordinator)

    expect(await db().value('select public.approve_proposal($1)', [proposal])).toMatchObject({ status: 'failed', error: 'invalid_payload' })
    await db().asOwner()
    expect(await db().value<number>('select count(*)::int from guest_requirements')).toBe(0)
  })

  it('expires a proposal that is approved too late', async () => {
    await db().createEvent()
    const proposal = await createProposal('Assign driver', crypto.randomUUID(), '2020-01-01T00:00:00Z')
    const coordinator = await db().createProfile('coordinator')
    await db().asUser(coordinator)

    const result = await db().value('select public.approve_proposal($1)', [proposal])
    expect(result).toEqual({ id: proposal, status: 'expired' })
  })
})

describe('notifications', () => {
  const db = useTestDb()

  async function notify(recipient: string, title: string): Promise<void> {
    await db().asSystem()
    await db().rows(`select private.notify_users(array[$1::uuid], 'pickup_changed', $2)`, [recipient, title])
    await db().asOwner()
  }

  it('shows each person only their own notifications and lets them mark them read', async () => {
    await db().createEvent()
    const driver = await db().createProfile('driver')
    const other = await db().createProfile('driver')
    await notify(driver, 'Pickup moved to 16:45')
    await notify(other, 'Not yours')

    await db().asUser(driver)
    const visible = await db().rows<{ title: string }>('select title from notifications')
    expect(visible).toEqual([{ title: 'Pickup moved to 16:45' }])

    const marked = await db().rows('update notifications set read_at = now() where read_at is null returning title')
    expect(marked).toEqual([{ title: 'Pickup moved to 16:45' }])

    const edit = await db().expectError(() => db().rows(`update notifications set title = 'Changed'`))
    expect(edit.code).toBe('42501')
  })

  it('ignores null and duplicate recipients', async () => {
    await db().createEvent()
    const driver = await db().createProfile('driver')
    await db().asSystem()
    const count = await db().value<number>(
      `select private.notify_users(array[$1::uuid, $1::uuid, null], 'pickup_changed', 'Hello')`,
      [driver],
    )
    expect(count).toBe(1)
  })
})
