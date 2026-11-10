// Helpers for SQL-level tests. Each test runs inside a transaction that is rolled back,
// switching between the owner, vip_app (as a given user) and vip_system as needed.
import type { PGlite } from '@electric-sql/pglite'
import { createMigratedPglite } from '@/db/tooling/pglite'
import { EVENT_DAY, EVENT_LAST_DAY } from '@/tests/support/event-dates'

export type AppRole =
  | 'super_admin'
  | 'programme_manager'
  | 'admin'
  | 'coordinator'
  | 'programs'
  | 'driver'
  | 'accommodation'
  | 'housekeeping'

export interface SqlError extends Error {
  readonly code?: string
  readonly hint?: string
  readonly detail?: string
}

export class TestDb {
  /**
   * Staff join every event automatically, as on a single-team installation, so tests about one
   * event need no membership set-up. Tests about isolation between events turn it off.
   */
  private autoMembership = true

  private constructor(private readonly db: PGlite) {}

  /** From now on, staff work only on the events a test adds them to (event_members). */
  separateTeams(): void {
    this.autoMembership = false
  }

  /** Called on every fresh transaction. */
  resetOptions(): void {
    this.autoMembership = true
  }

  static async create(): Promise<TestDb> {
    return new TestDb(await createMigratedPglite())
  }

  async close(): Promise<void> {
    await this.db.close()
  }

  async begin(): Promise<void> {
    await this.db.exec('begin')
  }

  async rollback(): Promise<void> {
    await this.db.exec('rollback')
  }

  async rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.db.query<T>(sql, params)
    return result.rows
  }

  async one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
    const rows = await this.rows<T>(sql, params)
    if (rows.length !== 1) {
      throw new Error(`Expected one row, got ${rows.length}: ${sql}`)
    }
    return rows[0] as T
  }

  async value<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
    const row = await this.one<Record<string, T>>(sql, params)
    return Object.values(row)[0] as T
  }

  /** Table owner: RLS does not apply. Used to arrange test data. */
  async asOwner(): Promise<void> {
    await this.db.exec(`reset role; select set_config('app.user_id', '', true);`)
    await this.db.exec('select private.clear_audit_context()')
  }

  /** The API's role, acting for the given staff member. */
  async asUser(userId: string): Promise<void> {
    await this.db.exec('set local role vip_app')
    await this.db.query(`select set_config('app.user_id', $1, true)`, [userId])
  }

  /** The event this request works in (what the API sets per request from step 9.3). */
  async inEvent(eventId: string): Promise<void> {
    await this.db.query(`select set_config('app.event_id', $1, true)`, [eventId])
  }

  /** vip_app with no signed-in user (no app.user_id). */
  async asAnonymous(): Promise<void> {
    await this.db.exec(`set local role vip_app; select set_config('app.user_id', '', true);`)
  }

  /** Trusted server work (jobs, auth library). */
  async asSystem(): Promise<void> {
    await this.db.exec(`set local role vip_system; select set_config('app.user_id', '', true);`)
  }

  /** Runs `action` expecting a Postgres error; the transaction stays usable afterwards. */
  async expectError(action: () => Promise<unknown>): Promise<SqlError> {
    await this.db.exec('savepoint expect_error')
    try {
      await action()
    } catch (error: unknown) {
      await this.db.exec('rollback to savepoint expect_error')
      return error as SqlError
    }
    await this.db.exec('release savepoint expect_error')
    throw new Error('Expected the statement to fail, but it succeeded')
  }

  // Factories (run as owner) ---------------------------------------------------------------

  async createEvent(overrides: Record<string, unknown> = {}): Promise<string> {
    const values = {
      name: 'Annual Summit',
      venue_name: 'Grand Hotel',
      timezone: 'Africa/Lagos',
      starts_on: EVENT_DAY,
      ends_on: EVENT_LAST_DAY,
      ...overrides,
    }
    const event = await this.insert('events', values)
    if (this.autoMembership) {
      await this.db.query(
        `insert into public.event_members (event_id, profile_id)
         select $1, p.id from public.profiles p where p.role <> 'super_admin' on conflict do nothing`,
        [event],
      )
    }
    return event
  }

  async createProfile(role: AppRole, overrides: Record<string, unknown> = {}): Promise<string> {
    const suffix = crypto.randomUUID().slice(0, 8)
    const profile = await this.insert('profiles', {
      full_name: `${role} ${suffix}`,
      email: `${role}.${suffix}@example.com`,
      role,
      must_change_password: false,
      ...overrides,
    })
    if (this.autoMembership && role !== 'super_admin') {
      await this.db.query(
        `insert into public.event_members (event_id, profile_id) select e.id, $1 from public.events e on conflict do nothing`,
        [profile],
      )
    }
    return profile
  }

  async createRoomType(overrides: Record<string, unknown> = {}): Promise<string> {
    return this.insert('room_types', {
      name: `Suite ${crypto.randomUUID().slice(0, 6)}`,
      tier: 1,
      default_capacity: 2,
      cleaning_minutes: 45,
      ...overrides,
    })
  }

  async createRoom(roomTypeId: string, overrides: Record<string, unknown> = {}): Promise<string> {
    return this.insert('rooms', {
      number: `R${Math.floor(Math.random() * 1_000_000)}`,
      floor: 1,
      wing: 'East',
      room_type_id: roomTypeId,
      ...overrides,
    })
  }

  async createDriver(overrides: Record<string, unknown> = {}): Promise<string> {
    return this.insert('drivers', {
      full_name: `Driver ${crypto.randomUUID().slice(0, 6)}`,
      vehicle_capacity: 4,
      ...overrides,
    })
  }

  async createVipCategory(name: string, rank: number): Promise<string> {
    return this.insert('vip_categories', { name, rank })
  }

  private async insert(table: string, values: Record<string, unknown>): Promise<string> {
    const columns = Object.keys(values)
    const placeholders = columns.map((_, index) => `$${index + 1}`)
    const sql = `insert into public.${table} (${columns.join(', ')})
      values (${placeholders.join(', ')}) returning id`
    return this.value<string>(sql, Object.values(values))
  }
}
