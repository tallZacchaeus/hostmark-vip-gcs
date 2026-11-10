// Development seed: the Figma demo venue (Harbour Point Hotel, Lagos: 120 rooms over 6 floors
// in West, East and Garden wings, numbered floor × 100 + 1…20), VIP categories, drivers with
// shifts, and one named account per role, so the frontend has realistic data to show.
// Refuses to run on a database that already has an event. Never used in production.
import { type Kysely, sql } from 'kysely'
import type { Auth } from '@/lib/auth/auth'
import { APP_ROLES, type AppRole } from '@/lib/auth/roles'
import type { DB } from '@/lib/db/types'
import { type GuestSeedResult, seedGuests } from './seed-guests'
import { type ProgrammeSeedResult, seedProgramme } from './seed-programme'
import { type RoomsSeedResult, seedRooms } from './seed-rooms'
import { type TransportSeedResult, seedTransport } from './seed-transport'

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_STARTS_IN_DAYS = 30
const EVENT_LENGTH_DAYS = 4
const FLOORS = 6
/** Room numbers x01–x07 are West, x08–x14 East, x15–x20 Garden (as in the Figma room grid). */
const WINGS = [
  { name: 'West', first: 1, last: 7 },
  { name: 'East', first: 8, last: 14 },
  { name: 'Garden', first: 15, last: 20 },
] as const
const DRIVER_NAMES = [
  'Emeka Oladipo', 'Sule Abdullahi', 'Kunle Balogun', 'Musa Ibrahim', 'Chinedu Okeke',
  'Yusuf Bello', 'Tunde Ajayi', 'Ibrahim Lawal', 'Obinna Nwankwo', 'Femi Adewale',
  'Garba Usman', 'Dayo Ogunleye', 'Nnamdi Eze', 'Ahmed Sani', 'Bayo Akinola',
] as const
const VEHICLES = [
  { label: 'Coaster bus', capacity: 18 },
  { label: 'Prado SUV', capacity: 6 },
  { label: 'Toyota Sienna', capacity: 7 },
  { label: 'Hiace bus', capacity: 14 },
] as const
const ACCOUNT_NAMES: Readonly<Record<AppRole, string>> = {
  super_admin: 'Segun Okoye',
  programme_manager: 'Ngozi Okafor',
  admin: 'Tolu Adebayo',
  coordinator: 'Ada Nwosu',
  programs: 'Kemi Bassey',
  driver: 'Emeka Oladipo',
  accommodation: 'Funke Adeyemi',
  housekeeping: 'Chioma Eze',
}
/** Two shifts a day in UTC (06:00–14:00 and 14:00–22:00 in Lagos, UTC+1). */
// Early and late shifts overlap at midday, as real rosters do, so an airport run that spans the
// handover (busy from an hour before pickup to an hour after) still fits one driver's shift.
const SHIFTS_UTC = [
  { start: 'T05:00:00Z', end: 'T14:00:00Z' },
  { start: 'T11:00:00Z', end: 'T21:00:00Z' },
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
  readonly guests: GuestSeedResult
  readonly transport: TransportSeedResult
  readonly allocation: RoomsSeedResult
  readonly programme: ProgrammeSeedResult
}

const isoDate = (date: Date): string => date.toISOString().slice(0, 10)

function eventDays(now: Date, startsInDays: number): string[] {
  const start = new Date(now.getTime() + startsInDays * DAY_MS)
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
    WINGS.flatMap((wing) =>
      Array.from({ length: wing.last - wing.first + 1 }, (_, offset) => {
        const type = roomTypeForFloor(floor)
        const column = wing.first + offset
        return {
          number: String(floor * 100 + column),
          floor,
          wing: wing.name,
          position: column,
          room_type_id: typeIds.get(type) ?? '',
          capacity: ROOM_TYPES.find((roomType) => roomType.name === type)?.default_capacity ?? 1,
          // The two rooms nearest the lifts in each wing on the ground floor are accessible.
          is_accessible: floor === 1 && offset < 2,
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
        name: 'Lagos Leadership Summit 2026',
        venue_name: 'Harbour Point Hotel & Conference Centre, Lagos',
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
        DRIVER_NAMES.map((full_name, index) => {
          const vehicle = VEHICLES[index % VEHICLES.length] ?? VEHICLES[0]
          return {
            full_name,
            phone: `+23480${String(10_000_000 + index).padStart(8, '0')}`,
            vehicle_label: vehicle.label,
            vehicle_capacity: vehicle.capacity,
          }
        }),
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

async function seedAccounts(db: Kysely<DB>, auth: Auth, password: string, eventId: string, driverLoginFor: string | undefined) {
  // Better Auth creates the accounts first (its own connection), then one audited transaction
  // marks them ready to use and links the driver login.
  const created: Array<{ role: AppRole; email: string; id: string }> = []
  for (const role of APP_ROLES) {
    const email = `${role.replace('_', '.')}@vipgcs.test`
    const user = await auth.api.createUser({ body: { email, password, name: ACCOUNT_NAMES[role], role } })
    created.push({ role, email, id: user.user.id })
  }

  await db.transaction().execute(async (tx) => {
    await sql`select private.set_audit_context(p_actor_type => 'system', p_action => 'seed', p_undoable => false)`.execute(tx)
    await tx
      .updateTable('profiles')
      .set({ must_change_password: false })
      .where('id', 'in', created.map((account) => account.id))
      .execute()
    // The demo event is live and run by the demo Programme Manager; everyone else works on it
    // (Super Admins see every event without being members).
    const manager = created.find((account) => account.role === 'programme_manager')
    await tx.updateTable('events').set({ status: 'live', owner_id: manager?.id ?? null }).where('id', '=', eventId).execute()
    const members = created.filter((account) => account.role !== 'super_admin')
    await tx
      .insertInto('event_members')
      .values(members.map((account) => ({ event_id: eventId, profile_id: account.id })))
      .execute()
    const driverLogin = created.find((account) => account.role === 'driver')
    if (driverLogin && driverLoginFor) {
      await tx.updateTable('drivers').set({ profile_id: driverLogin.id }).where('id', '=', driverLoginFor).execute()
    }
  })
  return created.map(({ role, email }) => ({ role, email }))
}

export interface SeedOptions {
  readonly now?: Date
  /** Days from now to the first event day: 0 makes "today" an event day for a live demo. */
  readonly startsInDays?: number
}

export async function seedDevData(db: Kysely<DB>, auth: Auth, password: string, options: SeedOptions = {}): Promise<SeedResult> {
  const now = options.now ?? new Date()
  const existing = await db.selectFrom('events').select('id').executeTakeFirst()
  if (existing) {
    throw new Error('The database already has an event; the dev seed only runs on an empty database (pnpm db:reset first).')
  }
  const days = eventDays(now, options.startsInDays ?? DEFAULT_STARTS_IN_DAYS)
  const venue = await seedVenue(db, days)
  const accounts = await seedAccounts(db, auth, password, venue.eventId, venue.driverIds[0])
  const guests = await seedGuests(db, days[0] ?? '', days.at(-1) ?? '')
  const transport = await seedTransport(db, days[0] ?? '', venue.driverIds)
  const allocation = await seedRooms(db, now)
  const programme = await seedProgramme(db, days)
  return { eventId: venue.eventId, startsOn: days[0] ?? '', rooms: venue.rooms, drivers: venue.driverIds.length, accounts, guests, transport, allocation, programme }
}
