// P9 step 9.6 (docs/06-Implementation-Plan.md; security review finding MED 4): a row may only
// point at records of its own event. Without this, someone who learned another event's record id
// could link it (a room of event B in an assignment of event A), even though they cannot read it.
import { describe, expect, it } from 'vitest'
import type { TestDb } from './support/test-db'
import { useTestDb } from './support/use-test-db'

async function eventWithRoomAndGuest(db: TestDb, name: string) {
  await db.asOwner()
  const event = await db.createEvent({ name, status: 'live', owner_id: null })
  await db.inEvent(event)
  const roomType = await db.createRoomType()
  const room = await db.createRoom(roomType)
  const delegation = await db.value<string>(`insert into delegations (name) values ($1) returning id`, [`${name} party`])
  const guest = await db.value<string>(
    `insert into guests (delegation_id, member_role, full_name) values ($1, 'principal', $2) returning id`,
    [delegation, `${name} guest`],
  )
  const driver = await db.createDriver()
  return { event, roomType, room, delegation, guest, driver }
}

describe('references stay inside one event (P9 step 9.6)', () => {
  const db = useTestDb()

  it("refuses a row that points at another event's record", async () => {
    // Arrange
    const a = await eventWithRoomAndGuest(db(), 'Alpha')
    const b = await eventWithRoomAndGuest(db(), 'Beta')

    // Act: written by trusted server code in event A, naming B's room or delegation.
    await db().inEvent(a.event)
    const room = await db().expectError(() =>
      db().rows(`insert into rooms (number, floor, wing, room_type_id) values ('X1', 1, 'East', $1)`, [b.roomType]),
    )
    const guest = await db().expectError(() =>
      db().rows(`insert into guests (delegation_id, member_role, full_name) values ($1, 'assistant', 'Stray')`, [b.delegation]),
    )
    const moved = await db().expectError(() => db().rows(`update guests set delegation_id = $1 where id = $2`, [b.delegation, a.guest]))

    // Assert
    for (const error of [room, guest, moved]) {
      expect(error.hint).toBe('cross_event_reference')
    }
  })

  it('refuses a link table row whose two ends belong to different events', async () => {
    // Arrange
    const a = await eventWithRoomAndGuest(db(), 'Alpha')
    const b = await eventWithRoomAndGuest(db(), 'Beta')
    await db().inEvent(a.event)
    const item = await db().value<string>(
      `insert into program_items (title, location, starts_at, ends_at) values ('Opening', 'Main hall', now(), now() + interval '1 hour') returning id`,
    )

    // Act
    const error = await db().expectError(() =>
      db().rows(`insert into program_participants (program_item_id, guest_id) values ($1, $2)`, [item, b.guest]),
    )

    // Assert
    expect(error.hint).toBe('cross_event_reference')
  })

  it('accepts references inside the same event', async () => {
    // Arrange
    const a = await eventWithRoomAndGuest(db(), 'Alpha')

    // Act
    await db().inEvent(a.event)
    const rows = await db().rows(`insert into rooms (number, floor, wing, room_type_id) values ('A2', 1, 'East', $1) returning id`, [a.roomType])

    // Assert
    expect(rows).toHaveLength(1)
  })
  it('covers every reference into an event table, including tables added later', async () => {
    // Arrange / Act: tables that reference an event table and carry their own event_id, and any
    // composite reference (which the trigger cannot check).
    const uncovered = await db().rows<{ table_name: string }>(`
      select distinct c.conrelid::regclass::text as table_name
      from pg_constraint c
      join pg_class r on r.oid = c.confrelid
      join pg_namespace n on n.oid = r.relnamespace
      where c.contype = 'f' and n.nspname = 'public' and r.relname <> 'events'
        and exists (select 1 from pg_attribute a where a.attrelid = c.confrelid and a.attname = 'event_id' and not a.attisdropped)
        and (
          cardinality(c.conkey) > 1
          or (
            exists (select 1 from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'event_id' and not a.attisdropped)
            and not exists (select 1 from pg_trigger t where t.tgrelid = c.conrelid and t.tgname = 'same_event_refs')
          )
        )`)

    // Assert
    expect(uncovered).toEqual([])
  })
})
