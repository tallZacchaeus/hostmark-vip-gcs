// P9 step 9.1 (docs/06-Implementation-Plan.md): several events, their status and owner, staff
// membership, the Programme Manager role, and current_event_id() following the request's event.
import { describe, expect, it } from 'vitest'
import { useTestDb } from './support/use-test-db'

describe('multiple events (P9 step 9.1)', () => {
  const db = useTestDb()

  it('allows several events, each starting as a draft', async () => {
    // Arrange + Act
    const first = await db().createEvent()
    const second = await db().createEvent({ name: 'Second Summit' })

    // Assert
    const statuses = await db().rows<{ status: string }>(`select status from events where id in ($1, $2)`, [first, second])
    expect(statuses).toEqual([{ status: 'draft' }, { status: 'draft' }])
  })

  it('makes whoever creates an event its owner', async () => {
    // Arrange
    const manager = await db().createProfile('programme_manager')

    // Act
    await db().asUser(manager)
    const [created] = await db().rows<{ owner_id: string }>(
      `insert into events (name, venue_name, starts_on, ends_on) values ('Summit', 'Grand Hotel', '2026-11-20', '2026-11-23') returning owner_id`,
    )

    // Assert
    expect(created?.owner_id).toBe(manager)
  })

  it('accepts only draft, live and archived as a status', async () => {
    // Act
    const error = await db().expectError(() => db().createEvent({ status: 'paused' }))

    // Assert
    expect(error.code).toBe('23514')
  })

  it('lets a Programme Manager have one live event at a time, while other managers have theirs', async () => {
    // Arrange
    const ada = await db().createProfile('programme_manager')
    const bola = await db().createProfile('programme_manager')
    await db().createEvent({ owner_id: ada, status: 'live' })
    await db().createEvent({ owner_id: ada, name: 'Next year', status: 'draft' })

    // Act
    const secondLive = await db().expectError(() => db().createEvent({ owner_id: ada, name: 'Another', status: 'live' }))
    const otherManager = await db().createEvent({ owner_id: bola, name: 'Bola Live', status: 'live' })

    // Assert
    expect(secondLive.code).toBe('23505')
    expect(otherManager).toBeTruthy()
    expect(await db().value(`select count(*)::int from events where status = 'live'`)).toBe(2)
  })

  it('records which staff work on which event, once each', async () => {
    // Arrange
    db().separateTeams()
    const event = await db().createEvent()
    const driver = await db().createProfile('driver')
    await db().rows(`insert into event_members (event_id, profile_id) values ($1, $2)`, [event, driver])

    // Act
    const duplicate = await db().expectError(() =>
      db().rows(`insert into event_members (event_id, profile_id) values ($1, $2)`, [event, driver]),
    )

    // Assert
    expect(duplicate.code).toBe('23505')
    expect(await db().value(`select count(*)::int from event_members where profile_id = $1`, [driver])).toBe(1)
  })

  it('remembers the event a person last worked on, which must be a real event', async () => {
    // Arrange
    const event = await db().createEvent()

    // Act
    const coordinator = await db().createProfile('coordinator', { active_event_id: event })
    const unknown = await db().expectError(() => db().createProfile('coordinator', { active_event_id: crypto.randomUUID() }))

    // Assert
    expect(await db().value(`select active_event_id from profiles where id = $1`, [coordinator])).toBe(event)
    expect(unknown.code).toBe('23503')
  })

  it('makes current_event_id() the event chosen for the request, so new records land in it', async () => {
    // Arrange
    await db().createEvent({ name: 'First' })
    const second = await db().createEvent({ name: 'Second' })

    // Act
    await db().inEvent(second)
    const chosen = await db().value(`select private.current_event_id()`)
    const roomType = await db().createRoomType()

    // Assert
    expect(chosen).toBe(second)
    expect(await db().value(`select event_id from room_types where id = $1`, [roomType])).toBe(second)
  })

  it('falls back to the live event (or the only one) while no event is chosen, as before P9', async () => {
    // Arrange
    await db().createEvent({ name: 'Draft' })
    const live = await db().createEvent({ name: 'Live', status: 'live' })

    // Act + Assert
    expect(await db().value(`select private.current_event_id()`)).toBe(live)
  })

  it('ranks a Programme Manager above Admin: admin-level access and account management below it', async () => {
    // Arrange
    db().separateTeams()
    const manager = await db().createProfile('programme_manager')
    const admin = await db().createProfile('admin')
    const superAdmin = await db().createProfile('super_admin')
    // The installation's first event takes in existing staff (join_first_event); the insert is a no-op then.
    const event = await db().createEvent({ owner_id: manager, status: 'live' })
    await db().rows(`insert into event_members (event_id, profile_id) values ($1, $2) on conflict do nothing`, [event, admin])

    // Act
    await db().inEvent(event)
    await db().asUser(manager)
    const helpers = await db().one<{ admin_plus: boolean; coordinator_plus: boolean }>(
      `select private.is_admin_plus() as admin_plus, private.is_coordinator_plus() as coordinator_plus`,
    )
    const demoted = await db().rows(`update profiles set role = 'coordinator' where id = $1 returning role`, [admin])
    const untouched = await db().rows(`update profiles set role = 'coordinator' where id = $1 returning role`, [superAdmin])

    // Assert
    expect(helpers).toEqual({ admin_plus: true, coordinator_plus: true })
    expect(demoted).toEqual([{ role: 'coordinator' }])
    expect(untouched).toEqual([])
  })
})
