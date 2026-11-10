import { describe, expect, it } from 'vitest'
import { useTestDb } from './support/use-test-db'

interface AuditRow {
  id: string
  actor_type: string
  actor_id: string | null
  action: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  is_automatic: boolean
  undoable: boolean
  undo_of_audit_id: string | null
}

const SELECT_AUDIT = `select id, actor_type, actor_id, action, before, after, is_automatic, undoable, undo_of_audit_id
  from audit_log where entity_id = $1 order by id`

describe('audit log', () => {
  const db = useTestDb()

  async function roomOwnedByAdmin(): Promise<{ admin: string; room: string }> {
    await db().createEvent()
    const room = await db().createRoom(await db().createRoomType())
    const admin = await db().createProfile('admin')
    return { admin, room }
  }

  it('records who changed what, with before and after values', async () => {
    const { admin, room } = await roomOwnedByAdmin()
    await db().asUser(admin)
    await db().rows(`update rooms set wing = 'West' where id = $1`, [room])
    await db().asOwner()

    const entries = await db().rows<AuditRow>(SELECT_AUDIT, [room])
    const update = entries.at(-1)
    expect(update).toMatchObject({
      actor_type: 'user',
      actor_id: admin,
      action: 'rooms.update',
      is_automatic: false,
      undoable: false,
    })
    expect(update?.before?.wing).toBe('East')
    expect(update?.after?.wing).toBe('West')
  })

  it('skips updates that change nothing', async () => {
    const { admin, room } = await roomOwnedByAdmin()
    const before = (await db().rows(SELECT_AUDIT, [room])).length
    await db().asUser(admin)
    await db().rows(`update rooms set wing = wing where id = $1`, [room])
    await db().asOwner()
    expect(await db().rows(SELECT_AUDIT, [room])).toHaveLength(before)
  })

  it('marks system changes as automatic and undoable', async () => {
    const { room } = await roomOwnedByAdmin()
    await db().asSystem()
    await db().rows(`update rooms set housekeeping_status = 'needs_cleaning' where id = $1`, [room])
    await db().asOwner()

    const update = (await db().rows<AuditRow>(SELECT_AUDIT, [room])).at(-1)
    expect(update).toMatchObject({ actor_type: 'system', actor_id: null, is_automatic: true, undoable: true })
  })

  it('lets a coordinator undo an automatic change, once', async () => {
    const { room } = await roomOwnedByAdmin()
    const coordinator = await db().createProfile('coordinator')
    await db().asSystem()
    await db().rows(`update rooms set housekeeping_status = 'needs_cleaning' where id = $1`, [room])
    await db().asOwner()
    const automatic = (await db().rows<AuditRow>(SELECT_AUDIT, [room])).at(-1)

    await db().asUser(coordinator)
    await db().rows('select public.undo_audit_entry($1, $2)', [automatic?.id, 'Wrong room'])
    await db().asOwner()

    expect(await db().value('select housekeeping_status from rooms where id = $1', [room])).toBe('clean')
    const undo = (await db().rows<AuditRow>(SELECT_AUDIT, [room])).at(-1)
    expect(undo).toMatchObject({ action: 'rooms.undo', actor_type: 'user', actor_id: coordinator })
    expect(undo?.undo_of_audit_id).toBe(automatic?.id)

    await db().asUser(coordinator)
    const again = await db().expectError(() => db().rows('select public.undo_audit_entry($1)', [automatic?.id]))
    expect(again.hint).toBe('already_undone')
  })

  it('refuses to undo when the record changed since, naming who changed it', async () => {
    const { admin, room } = await roomOwnedByAdmin()
    const coordinator = await db().createProfile('coordinator', { full_name: 'Ada Coordinator' })
    await db().asSystem()
    await db().rows(`update rooms set housekeeping_status = 'needs_cleaning' where id = $1`, [room])
    await db().asOwner()
    const automatic = (await db().rows<AuditRow>(SELECT_AUDIT, [room])).at(-1)
    await db().rows(`update profiles set full_name = 'Bola Admin' where id = $1`, [admin])

    await db().asUser(admin)
    await db().rows(`update rooms set notes = 'Window repaired' where id = $1`, [room])

    await db().asUser(coordinator)
    const error = await db().expectError(() => db().rows('select public.undo_audit_entry($1)', [automatic?.id]))
    expect(error.hint).toBe('undo_conflict')
    expect(error.message).toContain('Bola Admin')
    expect(JSON.parse(error.detail ?? '{}')).toMatchObject({ changed_by: 'Bola Admin' })
  })

  it('undoes an automatic insert by deleting the row', async () => {
    await db().createEvent()
    const roomType = await db().createRoomType()
    const coordinator = await db().createProfile('coordinator')
    await db().asSystem()
    const room = await db().value<string>(
      `insert into rooms (number, floor, wing, room_type_id) values ('900', 9, 'North', $1) returning id`,
      [roomType],
    )
    await db().asOwner()
    const created = (await db().rows<AuditRow>(SELECT_AUDIT, [room])).at(-1)

    await db().asUser(coordinator)
    await db().rows('select public.undo_audit_entry($1)', [created?.id])
    await db().asOwner()
    expect(await db().value<number>('select count(*)::int from rooms where id = $1', [room])).toBe(0)
  })

  it('refuses undo for manual changes and for staff below coordinator', async () => {
    const { admin, room } = await roomOwnedByAdmin()
    const driver = await db().createProfile('driver')
    await db().asUser(admin)
    await db().rows(`update rooms set wing = 'West' where id = $1`, [room])
    await db().asOwner()
    const manual = (await db().rows<AuditRow>(SELECT_AUDIT, [room])).at(-1)

    await db().asUser(admin)
    const notUndoable = await db().expectError(() => db().rows('select public.undo_audit_entry($1)', [manual?.id]))
    expect(notUndoable.hint).toBe('not_undoable')

    await db().asUser(driver)
    const forbidden = await db().expectError(() => db().rows('select public.undo_audit_entry($1)', [manual?.id]))
    expect(forbidden.code).toBe('42501')
  })

  it('shows the log to coordinators only and never allows edits', async () => {
    const { admin, room } = await roomOwnedByAdmin()
    const coordinator = await db().createProfile('coordinator')
    const housekeeping = await db().createProfile('housekeeping')
    await db().asUser(admin)
    await db().rows(`update rooms set wing = 'West' where id = $1`, [room])

    await db().asUser(coordinator)
    expect(await db().value<number>('select count(*)::int from audit_log')).toBeGreaterThan(0)
    const edit = await db().expectError(() => db().rows(`update audit_log set reason = 'tampered'`))
    expect(edit.code).toBe('42501')
    const remove = await db().expectError(() => db().rows('delete from audit_log'))
    expect(remove.code).toBe('42501')

    await db().asUser(housekeeping)
    expect(await db().value<number>('select count(*)::int from audit_log')).toBe(0)
  })

  it('records account changes made through the auth library with the acting admin', async () => {
    await db().createEvent()
    const admin = await db().createProfile('admin')
    await db().asSystem()
    const created = await db().value<string>(
      `insert into profiles (full_name, email, role) values ('New Driver', 'new.driver@example.com', 'driver') returning id`,
    )
    await db().asOwner()
    expect(await db().rows(SELECT_AUDIT, [created])).toEqual([])

    await db().asUser(admin)
    // As createAccount does: the new account joins the admin's event first (P9), then the change is audited.
    await db().rows(`insert into event_members (event_id, profile_id) values (private.current_event_id(), $1)`, [created])
    await db().rows(`select private.audit_profile_change($1, 'profiles.create')`, [created])
    await db().asOwner()
    const entries = await db().rows<AuditRow>(SELECT_AUDIT, [created])
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ action: 'profiles.create', actor_id: admin })
  })

  it('still undoes when only updated_at moved since', async () => {
    const { room } = await roomOwnedByAdmin()
    const coordinator = await db().createProfile('coordinator')
    await db().asSystem()
    await db().rows(`update rooms set housekeeping_status = 'needs_cleaning' where id = $1`, [room])
    await db().asOwner()
    const automatic = (await db().rows<AuditRow>(SELECT_AUDIT, [room])).at(-1)
    await db().rows(`update rooms set updated_at = now() + interval '1 minute' where id = $1`, [room])

    await db().asUser(coordinator)
    await db().rows('select public.undo_audit_entry($1)', [automatic?.id])
    await db().asOwner()
    expect(await db().value('select housekeeping_status from rooms where id = $1', [room])).toBe('clean')
  })

  it('never undoes account changes, even automatic ones', async () => {
    await db().createEvent()
    const coordinator = await db().createProfile('coordinator')
    const driver = await db().createProfile('driver')
    await db().asSystem()
    await db().rows(`select private.set_audit_context(p_actor_type => 'system', p_undoable => true)`)
    await db().rows(`update profiles set role = 'admin' where id = $1`, [driver])
    await db().asOwner()
    const entry = (await db().rows<AuditRow>(SELECT_AUDIT, [driver])).at(-1)
    expect(entry?.undoable).toBe(true)

    await db().asUser(coordinator)
    const error = await db().expectError(() => db().rows('select public.undo_audit_entry($1)', [entry?.id]))
    expect(error.hint).toBe('not_undoable')
  })

  it('reports an undo blocked by related records as a conflict', async () => {
    await db().createEvent()
    const roomType = await db().createRoomType()
    const coordinator = await db().createProfile('coordinator')
    await db().asSystem()
    const room = await db().value<string>(
      `insert into rooms (number, floor, wing, room_type_id) values ('950', 9, 'North', $1) returning id`,
      [roomType],
    )
    await db().rows('delete from rooms where id = $1', [room])
    await db().asOwner()
    const deleted = (await db().rows<AuditRow>(SELECT_AUDIT, [room])).at(-1)
    await db().rows('delete from room_types where id = $1', [roomType])

    await db().asUser(coordinator)
    const error = await db().expectError(() => db().rows('select public.undo_audit_entry($1)', [deleted?.id]))
    expect(error.hint).toBe('undo_conflict')
  })

  it('stops an admin from writing account audit entries about a Super Admin', async () => {
    await db().createEvent()
    const admin = await db().createProfile('admin')
    const superAdmin = await db().createProfile('super_admin')
    await db().asUser(admin)
    const error = await db().expectError(() =>
      db().rows(`select private.audit_profile_change($1, 'profiles.password_reset')`, [superAdmin]),
    )
    expect(error.code).toBe('42501')
  })

  it('stops non-admins from writing account audit entries', async () => {
    await db().createEvent()
    const coordinator = await db().createProfile('coordinator')
    await db().asUser(coordinator)
    const error = await db().expectError(() =>
      db().rows(`select private.audit_profile_change($1, 'profiles.create')`, [coordinator]),
    )
    expect(error.code).toBe('42501')
  })
})
