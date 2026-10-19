// Development seed (P1 seed v1): an event about a month out, a 126-room venue, VIP categories,
// drivers with shifts, and one account per role, so the frontend has realistic data to show.
// Refuses to run on a database that already has an event. Never used in production.
import { type Kysely, sql } from 'kysely'
import type { Auth } from '@/lib/auth/auth'
import { APP_ROLES, type AppRole } from '@/lib/auth/roles'
import type { DB } from '@/lib/db/types'

const DAY_MS = 24 * 60 * 60 * 1000
const EVENT_STARTS_IN_DAYS = 30
const EVENT_LENGTH_DAYS = 4
const FLOORS = 6
const WINGS = ['East', 'West', 'North'] as const
const ROOMS_PER_WING_PER_FLOOR = 7
const DRIVER_COUNT = 15
const VEHICLE_CAPACITIES = [4, 7, 14] as const
/** Two shifts a day in UTC (06:00–14:00 and 14:00–22:00 in Lagos, UTC+1). */
const SHIFTS_UTC = [
  { start: 'T05:00:00Z', end: 'T13:00:00Z' },
  { start: 'T13:00:00Z', end: 'T21:00:00Z' },
] as const

const ROOM_TYPES = [
  { name: 'Presidential Suite', tier: 1, default_capacity: 2, cleaning_minutes: 90 },
  { name: 'Executive Suite', tier: 2, default_capacity: 2, cleaning_minutes: 60 },
  { name: 'Deluxe', tier: 3, default_capacity: 2, cleaning_minutes: 45 },
  { name: 'Standard', tier: 4, default_capacity: 1, cleaning_minutes: 30 },
] as const

const VIP_CATEGORIES = [
  { name: 'Head of State / Minister', rank: 1, preferred_room_tier: 1 },
  { name: 'Clergy / Executive', rank: 2, preferred_room_tier: 2 },
  { name: 'Dignitary', rank: 3, preferred_room_tier: 3 },
  { name: 'Entourage', rank: 4, preferred_room_tier: 4 },
] as const

export interface SeedResult {
  readonly eventId: string
  readonly startsOn: string
  readonly rooms: number
  readonly drivers: number
  readonly accounts: ReadonlyArray<{ readonly role: AppRole; readonly email: string }>
}

const isoDate = (date: Date): string => date.toISOString().slice(0, 10)

function eventDays(now: Date): string[] {
  const start = new Date(now.getTime() + EVENT_STARTS_IN_DAYS * DAY_MS)
  return Array.from({ length: EVENT_LENGTH_DAYS }, (_, index) => isoDate(new Date(start.getTime() + index * DAY_MS)))
}

/** Suites on the top floors, standard rooms lower down. */
function roomTypeForFloor(floor: number): (typeof ROOM_TYPES)[number]['name'] {
  if (floor === FLOORS) return 'Presidential Suite'
  if (floor === FLOORS - 1) return 'Executive Suite'
  return floor >= 3 ? 'Deluxe' : 'Standard'
}

function plannedRooms(typeIds: ReadonlyMap<string, string>) {
  return Array.from({ length: FLOORS }, (_, floorIndex) => floorIndex + 1).flatMap((floor) =>
    WINGS.flatMap((wing, wingIndex) =>
      Array.from({ length: ROOMS_PER_WING_PER_FLOOR }, (_, position) => {
        const type = roomTypeForFloor(floor)
        return {
          number: `${floor}${wingIndex}${String(position + 1).padStart(2, '0')}`,
          floor,
          wing,
          position: position + 1,
          room_type_id: typeIds.get(type) ?? '',
          capacity: ROOM_TYPES.find((roomType) => roomType.name === type)?.default_capacity ?? 1,
          is_accessible: floor === 1 && position < 2,
        }
      }),
    ),
  )
}

async function seedVenue(db: Kysely<DB>, days: readonly string[]) {
  return db.transaction().execute(async (tx) => {
    await sql`select private.set_audit_context(p_actor_type => 'system', p_action => 'seed', p_undoable => false)`.execute(tx)
    const event = await tx
      .insertInto('events')
      .values({
        name: 'Annual Leadership Summit',
        venue_name: 'Grand Lagos Hotel',
        timezone: 'Africa/Lagos',
        starts_on: days[0] ?? '',
        ends_on: days.at(-1) ?? '',
        arrival_airports: ['LOS', 'ABV'],
        intake_open: true,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    const types = await tx.insertInto('room_types').values([...ROOM_TYPES]).returning(['id', 'name']).execute()
    const rooms = await tx
      .insertInto('rooms')
      .values(plannedRooms(new Map(types.map((type) => [type.name, type.id]))))
      .returning('id')
      .execute()
    await tx.insertInto('vip_categories').values([...VIP_CATEGORIES]).execute()

    const drivers = await tx
      .insertInto('drivers')
      .values(
        Array.from({ length: DRIVER_COUNT }, (_, index) => ({
          full_name: `Driver ${String(index + 1).padStart(2, '0')}`,
          phone: `+23480${String(10_000_000 + index).padStart(8, '0')}`,
          vehicle_label: `Vehicle ${index + 1}`,
          vehicle_capacity: VEHICLE_CAPACITIES[index % VEHICLE_CAPACITIES.length] ?? 4,
        })),
      )
      .returning('id')
      .execute()
    await tx
      .insertInto('driver_shifts')
      .values(
        drivers.flatMap((driver, index) =>
          days.map((day) => {
            const shift = SHIFTS_UTC[index % SHIFTS_UTC.length] ?? SHIFTS_UTC[0]
            return { driver_id: driver.id, starts_at: `${day}${shift.start}`, ends_at: `${day}${shift.end}` }
          }),
        ),
      )
      .execute()

    return { eventId: event.id, rooms: rooms.length, driverIds: drivers.map((driver) => driver.id) }
  })
}

async function seedAccounts(db: Kysely<DB>, auth: Auth, password: string, driverLoginFor: string | undefined) {
  // Better Auth creates the accounts first (its own connection), then one audited transaction
  // marks them ready to use and links the driver login.
  const created: Array<{ role: AppRole; email: string; id: string }> = []
  for (const role of APP_ROLES) {
    const email = `${role.replace('_', '.')}@vipgcs.test`
    const user = await auth.api.createUser({ body: { email, password, name: `Dev ${role.replace('_', ' ')}`, role } })
    created.push({ role, email, id: user.user.id })
  }

  await db.transaction().execute(async (tx) => {
    await sql`select private.set_audit_context(p_actor_type => 'system', p_action => 'seed', p_undoable => false)`.execute(tx)
    await tx
      .updateTable('profiles')
      .set({ must_change_password: false })
      .where('id', 'in', created.map((account) => account.id))
      .execute()
    const driverLogin = created.find((account) => account.role === 'driver')
    if (driverLogin && driverLoginFor) {
      await tx.updateTable('drivers').set({ profile_id: driverLogin.id }).where('id', '=', driverLoginFor).execute()
    }
  })
  return created.map(({ role, email }) => ({ role, email }))
}

export async function seedDevData(db: Kysely<DB>, auth: Auth, password: string, now: Date = new Date()): Promise<SeedResult> {
  const existing = await db.selectFrom('events').select('id').executeTakeFirst()
  if (existing) {
    throw new Error('The database already has an event; the dev seed only runs on an empty database (pnpm db:reset first).')
  }
  const days = eventDays(now)
  const venue = await seedVenue(db, days)
  const accounts = await seedAccounts(db, auth, password, venue.driverIds[0])
  return { eventId: venue.eventId, startsOn: days[0] ?? '', rooms: venue.rooms, drivers: venue.driverIds.length, accounts }
}
