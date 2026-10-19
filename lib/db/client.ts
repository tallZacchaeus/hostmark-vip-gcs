// Database connections. The API pool logs in as vip_app (DATABASE_URL); every request then runs
// in a transaction via withUser (lib/db/context.ts). Better Auth gets its own small pool whose
// sessions switch to vip_system, because its queries run outside our per-request transactions.
// Real-time notifications use a separate LISTEN connection (lib/realtime/pg-channel-source.ts).
import 'server-only'
import { type Dialect, Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import { getServerEnv } from '@/lib/env'
import { logger } from '@/lib/logger'
import type { ChannelSource } from '@/lib/realtime/notification-hub'
import { createPgChannelSource } from '@/lib/realtime/pg-channel-source'
import type { DB } from './types'

// Keep `date` columns as 'YYYY-MM-DD'. Parsing them into JS Dates would shift them by the
// server's UTC offset (an event starting 2026-11-20 must not become 2026-11-19).
const DATE_OID = 1082
pg.types.setTypeParser(DATE_OID, (value: string) => value)

const APP_POOL_MAX = 10
const AUTH_POOL_MAX = 4

export interface Database {
  readonly app: Kysely<DB>
  readonly authDialect: Dialect
  readonly channels: ChannelSource
  close(): Promise<void>
}

function createPool(connectionString: string, max: number, name: string): pg.Pool {
  const pool = new pg.Pool({ connectionString, max, application_name: name })
  pool.on('error', (error) => logger.error('Idle database connection failed', { pool: name, error }))
  return pool
}

function createDatabase(connectionString: string, serviceConnectionString: string): Database {
  const appPool = createPool(connectionString, APP_POOL_MAX, 'vip-gcs-api')
  // Separate login (vip_service): the API's own credential cannot become vip_system.
  const authPool = createPool(serviceConnectionString, AUTH_POOL_MAX, 'vip-gcs-auth')
  authPool.on('connect', (client) => {
    client.query('set role vip_system').catch((error: unknown) => {
      // Fails closed: vip_service itself has no table privileges.
      logger.error('Could not switch the auth connection to vip_system', { error })
    })
  })

  const app = new Kysely<DB>({ dialect: new PostgresDialect({ pool: appPool }) })
  return {
    app,
    authDialect: new PostgresDialect({ pool: authPool }),
    channels: createPgChannelSource(connectionString, logger),
    async close() {
      await app.destroy()
      await authPool.end()
    },
  }
}

let database: Database | undefined

function getDatabase(): Database {
  if (!database) {
    const env = getServerEnv()
    database = createDatabase(env.DATABASE_URL, env.SERVICE_DATABASE_URL)
  }
  return database
}

export function getDb(): Kysely<DB> {
  return getDatabase().app
}

export function getAuthDialect(): Dialect {
  return getDatabase().authDialect
}

export function getChannelSource(): ChannelSource {
  return getDatabase().channels
}

/** Closes every connection, e.g. at the end of a script so the process can exit. */
export async function closeDatabase(): Promise<void> {
  await database?.close()
  database = undefined
}

/** Tests inject an in-process database (see tests/integration/support). */
export function setDatabaseForTesting(replacement: Database | undefined): void {
  database = replacement
}
