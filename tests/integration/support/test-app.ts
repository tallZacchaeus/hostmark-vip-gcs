// Boots the real API stack (Kysely, Better Auth, route handlers) on an in-process PGlite with all
// migrations applied, and offers helpers to create staff and call route handlers as them.
import type { PGlite } from '@electric-sql/pglite'
import { Kysely, PostgresDialect } from 'kysely'
import { createMigratedPglite } from '@/db/tooling/pglite'
import { pglitePool } from '@/db/tooling/pglite-pool'
import type { NextRouteHandler } from '@/lib/api/handler'
import { type Auth, createAuth, setAuthForTesting } from '@/lib/auth/auth'
import type { AppRole } from '@/lib/auth/roles'
import { setDatabaseForTesting } from '@/lib/db/client'
import type { DB } from '@/lib/db/types'
import { resetNotificationHubForTesting } from '@/lib/realtime/hub'

export const BASE_URL = 'http://localhost:3000'
const TEST_PASSWORD = 'Correct-Horse-42'

export interface StaffMember {
  readonly id: string
  readonly email: string
  readonly password: string
  readonly token: string
  readonly role: AppRole
}

export interface CallOptions {
  readonly method?: string
  readonly as?: StaffMember
  readonly body?: unknown
  readonly rawBody?: string
  readonly contentType?: string
  readonly params?: Record<string, string>
  readonly headers?: Record<string, string>
}

export interface ApiResult<T = unknown> {
  readonly status: number
  readonly headers: Headers
  readonly body: { success: boolean; data: T; error: { code: string; message: string; details?: unknown } | null; meta?: unknown }
}

export class TestApp {
  private constructor(
    readonly pglite: PGlite,
    readonly db: Kysely<DB>,
    readonly auth: Auth,
  ) {}

  static async start(): Promise<TestApp> {
    const pglite = await createMigratedPglite()
    const dialect = new PostgresDialect({ pool: pglitePool(pglite) })
    const db = new Kysely<DB>({ dialect })
    const auth = createAuth({
      dialect,
      secret: 'integration-test-secret-'.padEnd(48, 'x'),
      baseURL: BASE_URL,
      trustedOrigins: [BASE_URL],
      secureCookies: false,
      rateLimit: false,
    })
    setDatabaseForTesting({
      app: db,
      authDialect: dialect,
      // PGlite delivers LISTEN/NOTIFY in-process, standing in for the dedicated pg connection.
      channels: { listen: (channel, onPayload) => pglite.listen(channel, onPayload) },
      close: async () => db.destroy(),
    })
    setAuthForTesting(auth)
    return new TestApp(pglite, db, auth)
  }

  async stop(): Promise<void> {
    await resetNotificationHubForTesting()
    setAuthForTesting(undefined)
    setDatabaseForTesting(undefined)
    await this.db.destroy()
  }

  /** Runs SQL as the database owner (RLS does not apply). For arranging and inspecting data. */
  async sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
    return (await this.pglite.query<T>(text, params)).rows
  }

  async createEvent(): Promise<string> {
    const [row] = await this.sql<{ id: string }>(
      `insert into events (name, venue_name, timezone, starts_on, ends_on, arrival_airports)
       values ('Annual Summit', 'Grand Hotel', 'Africa/Lagos', '2026-11-20', '2026-11-23', '{LOS}')
       returning id`,
    )
    return row?.id ?? ''
  }

  /** Creates an account through Better Auth (as the API would) and signs it in. */
  async createStaff(
    role: AppRole,
    options: { mustChangePassword?: boolean; banned?: boolean; name?: string } = {},
  ): Promise<StaffMember> {
    const email = `${role}.${crypto.randomUUID().slice(0, 8)}@example.com`
    const created = await this.auth.api.createUser({
      body: { email, password: TEST_PASSWORD, name: options.name ?? `Test ${role}`, role },
    })
    const id = created.user.id
    await this.sql('update profiles set must_change_password = $2 where id = $1', [id, options.mustChangePassword ?? false])
    const token = await this.signIn(email, TEST_PASSWORD)
    if (options.banned) {
      await this.sql('update profiles set banned = true where id = $1', [id])
    }
    return { id, email, password: TEST_PASSWORD, token, role }
  }

  async signIn(email: string, password: string): Promise<string> {
    const { headers } = await this.auth.api.signInEmail({ body: { email, password }, returnHeaders: true })
    const token = headers.get('set-auth-token')
    if (!token) {
      throw new Error(`Sign-in for ${email} returned no bearer token`)
    }
    return token
  }

  /** Calls a route handler and parses the JSON envelope. */
  async call<T = unknown>(handler: NextRouteHandler, path: string, options: CallOptions = {}): Promise<ApiResult<T>> {
    const response = await this.rawCall(handler, path, options)
    return { status: response.status, headers: response.headers, body: (await response.json()) as ApiResult<T>['body'] }
  }

  /** Calls a route handler the way Next.js would, optionally as a signed-in staff member. */
  async rawCall(
    handler: NextRouteHandler,
    path: string,
    options: CallOptions & { readonly signal?: AbortSignal } = {},
  ): Promise<Response> {
    const headers = new Headers(options.headers)
    if (options.as) {
      headers.set('authorization', `Bearer ${options.as.token}`)
    }
    let body: string | undefined
    if (options.rawBody !== undefined) {
      body = options.rawBody
      headers.set('content-type', options.contentType ?? 'text/plain')
    } else if (options.body !== undefined) {
      body = JSON.stringify(options.body)
      headers.set('content-type', 'application/json')
    }
    const request = new Request(`${BASE_URL}${path}`, {
      method: options.method ?? (body === undefined ? 'GET' : 'POST'),
      headers,
      body,
      signal: options.signal,
    })
    return handler(request, { params: Promise.resolve(options.params ?? {}) })
  }
}
