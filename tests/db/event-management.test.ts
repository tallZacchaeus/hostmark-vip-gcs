// P9 step 9.4 (docs/06-Implementation-Plan.md): managing events. Programme Managers and Super
// Admins create events; an owner takes a draft live and archives it (one live event per owner);
// they assign staff and copy the setup of an earlier event into a new draft.
import { describe, expect, it } from 'vitest'
import type { TestDb } from './support/test-db'
import { useTestDb } from './support/use-test-db'

interface ManagedEvent {
  readonly id: string
  readonly name: string
  readonly status: string
  readonly member_count: number
}

interface StaffOption {
  readonly id: string
  readonly role: string
  readonly is_member: boolean
}

/** A manager with a live event, a member coordinator and a driver account (not a member). */
async function managerWithEvent(db: TestDb, name = 'Alpha') {
  db.separateTeams()
  await db.asOwner()
  const manager = await db.createProfile('programme_manager')
  const event = await db.createEvent({ name, owner_id: manager, status: 'live' })
  const coordinator = await db.createProfile('coordinator')
  await db.rows(`insert into event_members (event_id, profile_id) values ($1, $2)`, [event, coordinator])
  const driverAccount = await db.createProfile('driver')
  return { manager, event, coordinator, driverAccount }
}

async function draftOf(db: TestDb, owner: string, name = 'Next Year'): Promise<string> {
  await db.asOwner()
  return db.createEvent({ name, owner_id: owner, status: 'draft' })
}

const setStatus = (db: TestDb, event: string, status: string) =>
  db.value<string>(`select public.set_event_status($1::uuid, $2)`, [event, status])

describe('managing events (P9 step 9.4)', () => {
  const db = useTestDb()

  it('lets only Programme Managers and Super Admins create events, as their owner', async () => {
    // Arrange
    const { manager, event } = await managerWithEvent(db())
    const admin = await db().createProfile('admin')
    await db().rows(`insert into event_members (event_id, profile_id) values ($1, $2)`, [event, admin])

    // Act
    await db().asUser(manager)
    const created = await db().one<{ owner_id: string; status: string }>(
      `insert into events (name, venue_name, timezone, starts_on, ends_on)
       values ('Second', 'Hall', 'Africa/Lagos', '2027-03-01', '2027-03-03') returning owner_id, status`,
    )
    await db().asOwner()
    await db().asUser(admin)
    const refused = await db().expectError(() =>
      db().rows(
        `insert into events (name, venue_name, timezone, starts_on, ends_on)
         values ('Rogue', 'Hall', 'Africa/Lagos', '2027-03-01', '2027-03-03')`,
      ),
    )

    // Assert
    expect(created).toEqual({ owner_id: manager, status: 'draft' })
    expect(refused.code).toBe('42501')
  })

  it('takes a draft live, keeps one live event per owner, and archives', async () => {
    // Arrange
    const { manager, event } = await managerWithEvent(db())
    const draft = await draftOf(db(), manager)

    // Act
    await db().asUser(manager)
    const secondLive = await db().expectError(() => setStatus(db(), draft, 'live'))
    const archived = await setStatus(db(), event, 'archived')
    const live = await setStatus(db(), draft, 'live')
    const reopen = await db().expectError(() => setStatus(db(), event, 'live'))

    // Assert
    expect(secondLive.hint).toBe('live_event_exists')
    expect(archived).toBe('archived')
    expect(live).toBe('live')
    expect(reopen.hint).toBe('invalid_transition')
  })

  it("does not let anyone else change an event's status", async () => {
    // Arrange
    const alpha = await managerWithEvent(db(), 'Alpha')
    const beta = await managerWithEvent(db(), 'Beta')

    // Act
    await db().asUser(beta.manager)
    const otherManager = await db().expectError(() => setStatus(db(), alpha.event, 'archived'))
    await db().asOwner()
    await db().asUser(alpha.coordinator)
    const member = await db().expectError(() => setStatus(db(), alpha.event, 'archived'))
    await db().asOwner()
    const superAdmin = await db().createProfile('super_admin')
    await db().asUser(superAdmin)
    const bySuperAdmin = await setStatus(db(), alpha.event, 'archived')

    // Assert
    expect(otherManager.hint).toBe('not_found')
    expect(member.hint).toBe('forbidden')
    expect(bySuperAdmin).toBe('archived')
  })

  it('lists a manager their own events and a Super Admin every event', async () => {
    // Arrange
    const alpha = await managerWithEvent(db(), 'Alpha')
    await managerWithEvent(db(), 'Beta')
    const superAdmin = await db().createProfile('super_admin')

    // Act
    await db().asUser(alpha.manager)
    const mine = await db().value<ManagedEvent[]>(`select public.manageable_events()`)
    await db().asOwner()
    await db().asUser(superAdmin)
    const all = await db().value<ManagedEvent[]>(`select public.manageable_events()`)

    // Assert
    expect(mine.map((event) => [event.name, event.member_count])).toEqual([['Alpha', 1]])
    expect(all.map((event) => event.name).sort()).toEqual(['Alpha', 'Beta'])
  })

  it('assigns staff to an event and takes them off again', async () => {
    // Arrange
    const { manager, event, coordinator, driverAccount } = await managerWithEvent(db())

    // Act
    await db().asUser(manager)
    const before = await db().value<StaffOption[]>(`select public.event_staff($1::uuid)`, [event])
    await db().rows(`select public.set_event_member($1::uuid, $2::uuid, true)`, [event, driverAccount])
    await db().rows(`select public.set_event_member($1::uuid, $2::uuid, false)`, [event, coordinator])
    const after = await db().value<StaffOption[]>(`select public.event_staff($1::uuid)`, [event])
    const managerAsMember = await db().expectError(() =>
      db().rows(`select public.set_event_member($1::uuid, $2::uuid, true)`, [event, manager]),
    )

    // Assert
    const members = (list: StaffOption[]) => list.filter((person) => person.is_member).map((person) => person.id)
    expect(before.some((person) => person.role === 'programme_manager')).toBe(false)
    expect(members(before)).toEqual([coordinator])
    expect(members(after)).toEqual([driverAccount])
    expect(managerAsMember.hint).toBe('invalid_member')
  })

  it("refuses staff changes on an archived event and on another manager's event", async () => {
    // Arrange
    const alpha = await managerWithEvent(db(), 'Alpha')
    const beta = await managerWithEvent(db(), 'Beta')
    await db().rows(`update events set status = 'archived' where id = $1`, [alpha.event])

    // Act
    await db().asUser(alpha.manager)
    const archived = await db().expectError(() =>
      db().rows(`select public.set_event_member($1::uuid, $2::uuid, true)`, [alpha.event, alpha.driverAccount]),
    )
    const foreign = await db().expectError(() => db().rows(`select public.event_staff($1::uuid)`, [beta.event]))

    // Assert
    expect(archived.hint).toBe('event_archived')
    expect(foreign.hint).toBe('not_found')
  })
})

describe('copying setup from an earlier event (P9 step 9.4)', () => {
  const db = useTestDb()

  async function sourceWithSetup() {
    const world = await managerWithEvent(db())
    await db().inEvent(world.event)
    await db().rows(
      `update events set arrival_airports = '{LOS,ABV}', airport_travel_min = 75, coordinator_phone = '+2348035550142' where id = $1`,
      [world.event],
    )
    const roomType = await db().createRoomType({ name: 'Deluxe', tier: 2 })
    await db().createRoom(roomType, { number: '201', wing: 'North' })
    await db().createRoom(roomType, { number: '202', wing: 'North', out_of_service: true })
    await db().createVipCategory('Head of State', 1)
    await db().createDriver({ full_name: 'Musa Bello', profile_id: world.driverAccount })
    return world
  }

  const copy = (target: string, source: string, parts: string[]) =>
    db().value<Record<string, number>>(`select public.copy_event_setup($1::uuid, $2::uuid, $3::text[])`, [target, source, parts])

  it('copies settings, rooms, categories, drivers and staff into a new draft', async () => {
    // Arrange
    const source = await sourceWithSetup()
    const draft = await draftOf(db(), source.manager)

    // Act
    await db().asUser(source.manager)
    const counts = await copy(draft, source.event, ['settings', 'rooms', 'categories', 'drivers', 'staff'])
    await db().asOwner()
    const settings = await db().one(`select arrival_airports, airport_travel_min, coordinator_phone from events where id = $1`, [draft])
    const rooms = await db().rows<{ number: string; type_name: string; type_event: string; out_of_service: boolean }>(
      `select r.number, t.name as type_name, t.event_id as type_event, r.out_of_service
       from rooms r join room_types t on t.id = r.room_type_id where r.event_id = $1 order by r.number`,
      [draft],
    )
    const members = await db().rows<{ profile_id: string }>(`select profile_id from event_members where event_id = $1 order by profile_id`, [draft])

    // Assert
    expect(counts).toEqual({ room_types: 1, rooms: 2, categories: 1, drivers: 1, staff: 2 })
    expect(settings).toEqual({ arrival_airports: ['LOS', 'ABV'], airport_travel_min: 75, coordinator_phone: '+2348035550142' })
    expect(rooms).toEqual([
      { number: '201', type_name: 'Deluxe', type_event: draft, out_of_service: false },
      { number: '202', type_name: 'Deluxe', type_event: draft, out_of_service: false },
    ])
    expect(members.map((row) => row.profile_id).sort()).toEqual([source.coordinator, source.driverAccount].sort())
  })

  it('copies only the parts asked for', async () => {
    // Arrange
    const source = await sourceWithSetup()
    const draft = await draftOf(db(), source.manager)

    // Act
    await db().asUser(source.manager)
    const counts = await copy(draft, source.event, ['categories'])

    // Assert
    expect(counts).toEqual({ categories: 1 })
  })

  it('refuses to copy into a live event, into a draft that has setup, or from a foreign event', async () => {
    // Arrange
    const source = await sourceWithSetup()
    const other = await managerWithEvent(db(), 'Beta')
    const draft = await draftOf(db(), source.manager)
    await db().asUser(source.manager)
    await copy(draft, source.event, ['rooms'])

    // Act
    const intoLive = await db().expectError(() => copy(source.event, draft, ['rooms']))
    const twice = await db().expectError(() => copy(draft, source.event, ['rooms']))
    const foreign = await db().expectError(() => copy(draft, other.event, ['rooms']))
    const unknownPart = await db().expectError(() => copy(draft, source.event, ['guests']))

    // Assert
    expect(intoLive.hint).toBe('event_not_draft')
    expect(twice.hint).toBe('already_set_up')
    expect(foreign.hint).toBe('not_found')
    expect(unknownPart.code).toBe('22023')
  })
})

describe("keeping each manager's staff their own (P9 step 9.4, security review)", () => {
  const db = useTestDb()

  it("neither lists nor assigns another manager's staff", async () => {
    // Arrange
    const alpha = await managerWithEvent(db(), 'Alpha')
    const beta = await managerWithEvent(db(), 'Beta')
    const unassigned = await db().createProfile('coordinator')

    // Act
    await db().asUser(beta.manager)
    const offered = await db().value<StaffOption[]>(`select public.event_staff($1::uuid)`, [beta.event])
    const poach = await db().expectError(() =>
      db().rows(`select public.set_event_member($1::uuid, $2::uuid, true)`, [beta.event, alpha.coordinator]),
    )
    await db().rows(`select public.set_event_member($1::uuid, $2::uuid, true)`, [beta.event, unassigned])

    // Assert
    const ids = offered.map((person) => person.id)
    expect(ids).not.toContain(alpha.coordinator)
    expect(ids).toContain(unassigned)
    expect(poach.hint).toBe('forbidden')
  })

  it('does not let a manager change or reset an account that also works on an event they do not run', async () => {
    // Arrange: a Super Admin shared Alpha's coordinator with Beta.
    const alpha = await managerWithEvent(db(), 'Alpha')
    const beta = await managerWithEvent(db(), 'Beta')
    await db().rows(`insert into event_members (event_id, profile_id) values ($1, $2)`, [beta.event, alpha.coordinator])

    // Act
    await db().inEvent(beta.event)
    await db().asUser(beta.manager)
    const renamed = await db().rows(`update profiles set full_name = 'Taken over' where id = $1 returning id`, [alpha.coordinator])
    const reset = await db().expectError(() => db().rows(`select public.assert_may_manage_account($1::uuid)`, [alpha.coordinator]))
    await db().asOwner()
    await db().inEvent(alpha.event)
    await db().asUser(alpha.manager)
    const byOwnManager = await db().expectError(() => db().rows(`select public.assert_may_manage_account($1::uuid)`, [alpha.coordinator]))

    // Assert
    expect(renamed).toEqual([])
    expect(reset.hint).toBe('forbidden')
    expect(byOwnManager.hint).toBe('forbidden')
  })

  it('lets a Super Admin manage a shared account', async () => {
    // Arrange
    const alpha = await managerWithEvent(db(), 'Alpha')
    const beta = await managerWithEvent(db(), 'Beta')
    await db().rows(`insert into event_members (event_id, profile_id) values ($1, $2)`, [beta.event, alpha.coordinator])
    const superAdmin = await db().createProfile('super_admin')

    // Act
    await db().inEvent(alpha.event)
    await db().asUser(superAdmin)
    const allowed = await db().rows(`select public.assert_may_manage_account($1::uuid)`, [alpha.coordinator])

    // Assert
    expect(allowed).toHaveLength(1)
  })

  it('refuses direct team changes that skip the rules', async () => {
    // Arrange
    const alpha = await managerWithEvent(db(), 'Alpha')
    const beta = await managerWithEvent(db(), 'Beta')
    const admin = await db().createProfile('admin')
    await db().rows(`insert into event_members (event_id, profile_id) values ($1, $2)`, [alpha.event, admin])

    // Act: an Admin of Alpha writes event_members directly.
    await db().inEvent(alpha.event)
    await db().asUser(admin)
    const addManager = await db().expectError(() =>
      db().rows(`insert into event_members (event_id, profile_id) values ($1, $2)`, [alpha.event, beta.manager]),
    )
    const poach = await db().expectError(() =>
      db().rows(`insert into event_members (event_id, profile_id) values ($1, $2)`, [alpha.event, beta.coordinator]),
    )

    // Assert
    expect(addManager.code).toBe('42501')
    expect(poach.code).toBe('42501')
  })

  it('does not copy staff shared with an event the manager does not run', async () => {
    // Arrange
    const alpha = await managerWithEvent(db(), 'Alpha')
    const beta = await managerWithEvent(db(), 'Beta')
    await db().rows(`insert into event_members (event_id, profile_id) values ($1, $2)`, [alpha.event, beta.coordinator])
    const draft = await draftOf(db(), alpha.manager)

    // Act
    await db().asUser(alpha.manager)
    await db().rows(`select public.copy_event_setup($1::uuid, $2::uuid, '{staff}'::text[])`, [draft, alpha.event])
    await db().asOwner()
    const members = await db().rows<{ profile_id: string }>(`select profile_id from event_members where event_id = $1`, [draft])

    // Assert
    expect(members.map((row) => row.profile_id)).toEqual([alpha.coordinator])
  })
})
