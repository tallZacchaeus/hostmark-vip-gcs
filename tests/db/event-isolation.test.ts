// P9 step 9.2 (docs/06-Implementation-Plan.md): two events side by side on one database. Staff of
// one event can neither read nor change the other's data, through tables or through the
// security-definer functions the API calls; archived events are read-only.
import { describe, expect, it } from 'vitest'
import { EVENT_DAY } from '@/tests/support/event-dates'
import type { TestDb } from './support/test-db'
import { useTestDb } from './support/use-test-db'

interface EventWorld {
  readonly event: string
  readonly manager: string
  readonly coordinator: string
  readonly roomType: string
  readonly room: string
  readonly delegation: string
  readonly guest: string
  readonly proposal: string
}

/** One complete event: owner, a coordinator on its team, a room, a guest and a pending proposal. */
async function seedEvent(db: TestDb, name: string): Promise<EventWorld> {
  db.separateTeams()
  await db.asOwner()
  const manager = await db.createProfile('programme_manager')
  const event = await db.createEvent({ name, owner_id: manager, status: 'live' })
  await db.inEvent(event)
  const coordinator = await db.createProfile('coordinator')
  await db.rows(`insert into event_members (event_id, profile_id) values ($1, $2)`, [event, coordinator])
  const roomType = await db.createRoomType()
  const room = await db.createRoom(roomType, { number: '101' })
  const delegation = await db.value<string>(`insert into delegations (name) values ($1) returning id`, [`${name} party`])
  const guest = await db.value<string>(
    `insert into guests (delegation_id, member_role, full_name, status) values ($1, 'principal', $2, 'checked_in') returning id`,
    [delegation, `${name} guest`],
  )
  const proposal = await db.value<string>(
    `insert into proposals (kind, title, payload, rationale, created_by_type, target_type, target_id)
     values ('room_assignment', 'Place guest', jsonb_build_object('guest_id', $1::text, 'room_id', $2::text), '{}'::jsonb, 'system', 'guests', $1::uuid)
     returning id`,
    [guest, room],
  )
  return { event, manager, coordinator, roomType, room, delegation, guest, proposal }
}

describe('isolation between events (P9 step 9.2)', () => {
  const db = useTestDb()

  async function twoEvents() {
    const a = await seedEvent(db(), 'Alpha')
    const b = await seedEvent(db(), 'Beta')
    return { a, b }
  }

  it("shows a coordinator only their own event's records, even when asked by id", async () => {
    // Arrange
    const { a, b } = await twoEvents()

    // Act
    await db().inEvent(a.event)
    await db().asUser(a.coordinator)
    const rooms = await db().rows<{ id: string }>(`select id from rooms`)
    const guests = await db().rows<{ id: string }>(`select id from guests`)
    const otherGuest = await db().rows(`select id from guests where id = $1`, [b.guest])

    // Assert
    expect(rooms.map((row) => row.id)).toEqual([a.room])
    expect(guests.map((row) => row.id)).toEqual([a.guest])
    expect(otherGuest).toEqual([])
  })

  it('shows nothing, and accepts nothing, in an event the person does not work on', async () => {
    // Arrange
    const { a, b } = await twoEvents()

    // Act
    await db().inEvent(b.event)
    await db().asUser(a.coordinator)
    const current = await db().value(`select private.current_event_id()`)
    const rooms = await db().rows(`select id from rooms`)
    const insert = await db().expectError(() => db().rows(`insert into delegations (name) values ('Sneaky')`))

    // Assert
    expect(current).toBeNull()
    expect(rooms).toEqual([])
    // No event this person works on: refused with a clear "set up or choose an event first".
    expect(insert.code).toBe('55000')
    expect(insert.hint).toBe('event_not_found')
  })

  it("cannot change or delete the other event's rows, nor write into it by naming its id", async () => {
    // Arrange
    const { a, b } = await twoEvents()
    await db().inEvent(a.event)
    await db().asUser(a.coordinator)

    // Act
    const updated = await db().rows(`update guests set notes = 'x' where id = $1 returning id`, [b.guest])
    const deleted = await db().rows(`delete from delegations where id = $1 returning id`, [b.delegation])
    const planted = await db().expectError(() =>
      db().rows(`insert into delegations (event_id, name) values ($1, 'Planted')`, [b.event]),
    )

    // Assert
    expect(updated).toEqual([])
    expect(deleted).toEqual([])
    expect(planted.code).toBe('42501')
  })

  it("lets a Programme Manager into their own events, and a Super Admin into any, but not managers into others'", async () => {
    // Arrange
    const { a, b } = await twoEvents()
    const superAdmin = await db().createProfile('super_admin')

    // Act
    await db().inEvent(a.event)
    await db().asUser(a.manager)
    const ownRooms = await db().rows(`select id from rooms`)
    await db().inEvent(b.event)
    const othersRooms = await db().rows(`select id from rooms`)
    await db().asUser(superAdmin)
    const anyRooms = await db().rows<{ id: string }>(`select id from rooms`)

    // Assert
    expect(ownRooms).toHaveLength(1)
    expect(othersRooms).toEqual([])
    expect(anyRooms.map((row) => row.id)).toEqual([b.room])
  })

  it('lists only the events a person works on', async () => {
    // Arrange
    const { a } = await twoEvents()

    // Act
    await db().asUser(a.coordinator)
    const events = await db().rows<{ id: string }>(`select id from events`)

    // Assert
    expect(events.map((row) => row.id)).toEqual([a.event])
  })

  it('keeps an archived event readable but read-only', async () => {
    // Arrange
    const { a } = await twoEvents()
    await db().asOwner()
    await db().rows(`update events set status = 'archived' where id = $1`, [a.event])

    // Act
    await db().inEvent(a.event)
    await db().asUser(a.coordinator)
    const readable = await db().rows(`select id from guests`)
    const write = await db().expectError(() => db().rows(`insert into delegations (name) values ('Late')`))
    const removed = await db().rows(`delete from delegations where id = $1 returning id`, [a.delegation])

    // Assert
    expect(readable).toHaveLength(1)
    expect(write.code).toBe('42501')
    expect(removed).toEqual([])
  })

  it("refuses the API's actions on another event's records", async () => {
    // Arrange
    const { a, b } = await twoEvents()
    await db().inEvent(a.event)
    await db().asUser(a.coordinator)

    // Act
    const reject = await db().expectError(() => db().rows(`select public.reject_proposal($1, 'no')`, [b.proposal]))
    const checkOut = await db().expectError(() => db().rows(`select public.check_out_party($1)`, [b.delegation]))

    // Assert
    expect(reject.hint).toBe('not_found')
    expect(checkOut.hint).toBe('not_found')
    await db().asOwner()
    expect(await db().value(`select status from proposals where id = $1`, [b.proposal])).toBe('pending')
  })

  it('regenerates the registration link of the current event only', async () => {
    // Arrange
    const { a, b } = await twoEvents()
    await db().asOwner()
    const before = await db().value<string>(`select intake_token from events where id = $1`, [b.event])
    const admin = await db().createProfile('admin')
    await db().rows(`insert into event_members (event_id, profile_id) values ($1, $2)`, [a.event, admin])

    // Act
    await db().inEvent(a.event)
    await db().asUser(admin)
    await db().rows(`select public.regenerate_intake_token()`)

    // Assert
    await db().asOwner()
    expect(await db().value(`select intake_token from events where id = $1`, [b.event])).toBe(before)
  })

  it('gives the event context, the cleaning queue and driver trips of the current event only', async () => {
    // Arrange
    const { a, b } = await twoEvents()
    await db().asOwner()
    await db().inEvent(b.event)
    await db().rows(`insert into cleaning_tasks (event_id, room_id, status, checked_out_at, estimated_ready_at) values ($1, $2, 'pending', now(), now())`, [b.event, b.room])
    const driverLogin = await db().createProfile('driver')
    await db().createDriver({ profile_id: driverLogin })
    await db().inEvent(a.event)
    await db().rows(`insert into event_members (event_id, profile_id) values ($1, $2), ($3, $2)`, [a.event, driverLogin, b.event])
    const driverInA = await db().createDriver({ profile_id: driverLogin, full_name: 'Same person, event A' })

    // Act
    await db().asUser(a.coordinator)
    const context = await db().value<{ id: string }>(`select public.get_event_context()`)
    const queue = await db().rows(`select * from public.cleaning_queue(null)`)
    // my_driver_id() is internal (not callable by the API): ask as the owner, on the driver's behalf.
    await db().asOwner()
    await db().inEvent(a.event)
    await db().rows(`select set_config('app.user_id', $1, true)`, [driverLogin])
    const myDriver = await db().value(`select private.my_driver_id()`)

    // Assert
    expect(context.id).toBe(a.event)
    expect(queue).toEqual([])
    expect(myDriver).toBe(driverInA)
  })

  it('scopes driver shifts and programme participants through their parent records', async () => {
    // Arrange
    const { a, b } = await twoEvents()
    await db().asOwner()
    await db().inEvent(b.event)
    const driver = await db().createDriver()
    await db().rows(`insert into driver_shifts (driver_id, starts_at, ends_at) values ($1, $2, $3)`, [driver, `${EVENT_DAY}T06:00:00Z`, `${EVENT_DAY}T14:00:00Z`])
    const item = await db().value<string>(
      `insert into program_items (title, kind, starts_at, ends_at, location) values ('Gala', 'meal', $1, $2, 'Hall') returning id`,
      [`${EVENT_DAY}T18:00:00Z`, `${EVENT_DAY}T20:00:00Z`],
    )
    await db().rows(`insert into program_participants (program_item_id, guest_id, role) values ($1, $2, 'attendee')`, [item, b.guest])

    // Act
    await db().inEvent(a.event)
    await db().asUser(a.coordinator)
    const shifts = await db().rows(`select * from driver_shifts`)
    const participants = await db().rows(`select * from program_participants`)

    // Assert
    expect(shifts).toEqual([])
    expect(participants).toEqual([])
  })

  it("shows coordinators their own event's team, not every account in the system", async () => {
    // Arrange
    const { a, b } = await twoEvents()

    // Act
    await db().inEvent(a.event)
    await db().asUser(a.coordinator)
    const visible = await db().rows<{ id: string }>(`select id from profiles`)

    // Assert
    const ids = visible.map((row) => row.id)
    expect(ids).toContain(a.coordinator)
    expect(ids).toContain(a.manager)
    expect(ids).not.toContain(b.coordinator)
    expect(ids).not.toContain(b.manager)
  })

  it('keeps an archived event read-only for trusted server work too, closes its link and freezes its settings', async () => {
    // Arrange
    const { a } = await twoEvents()
    await db().asOwner()
    await db().rows(`update events set status = 'archived', intake_open = true where id = $1`, [a.event])
    const token = await db().value<string>(`select intake_token from events where id = $1`, [a.event])
    const admin = await db().createProfile('admin')
    await db().rows(`insert into event_members (event_id, profile_id) values ($1, $2)`, [a.event, admin])

    // Act
    await db().asSystem()
    await db().inEvent(a.event)
    const systemWrite = await db().expectError(() => db().rows(`insert into delegations (name) values ('Late system write')`))
    const link = await db().value<{ open: boolean }>(`select public.intake_link_context($1)`, [token])
    await db().asUser(admin)
    const renamed = await db().rows(`update events set name = 'Renamed' where id = $1 returning id`, [a.event])

    // Assert
    expect(systemWrite.code).toBe('42501')
    expect(link.open).toBe(false)
    expect(renamed).toEqual([])
  })

  it("does not let an admin copy another event's account into their audit log", async () => {
    // Arrange
    const { a, b } = await twoEvents()
    const admin = await db().createProfile('admin')
    await db().rows(`insert into event_members (event_id, profile_id) values ($1, $2)`, [a.event, admin])

    // Act
    await db().inEvent(a.event)
    await db().asUser(admin)
    const error = await db().expectError(() => db().rows(`select private.audit_profile_change($1, 'profiles.password_reset')`, [b.coordinator]))

    // Assert
    expect(error.hint).toBe('not_found')
  })

  it('puts the event scope on every table that belongs to an event', async () => {
    // Act
    const unscoped = await db().rows<{ table_name: string }>(
      `select c.table_name from information_schema.columns c
       join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
       where c.table_schema = 'public' and c.column_name = 'event_id' and t.table_type = 'BASE TABLE'
         and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.table_name
                         and p.policyname = 'event_scope' and p.permissive = 'RESTRICTIVE')`,
    )

    // Assert
    expect(unscoped).toEqual([])
  })

  it('treats a Programme Manager as an Admin wherever a rule names Admin', async () => {
    // Arrange
    const { a } = await twoEvents()

    // Act
    await db().inEvent(a.event)
    await db().asUser(a.manager)
    const created = await db().rows(`insert into room_types (name, tier, default_capacity, cleaning_minutes) values ('Suite', 2, 2, 45) returning name`)

    // Assert
    expect(created).toEqual([{ name: 'Suite' }])
  })
})
