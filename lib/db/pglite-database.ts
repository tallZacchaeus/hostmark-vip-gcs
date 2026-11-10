// Development mode without Docker: DATABASE_URL=pglite://<dir> (or pglite://memory) runs the
// database in-process with PGlite, real Postgres compiled to WebAssembly, with every migration
// applied. Never available in production (lib/env.ts rejects the scheme there).
//
// PGlite has one session, so the app and Better Auth share one pool whose lock serialises
// transactions exactly like a pool of size 1. Auth queries run as the database owner here, not
// as vip_system; API requests still switch to vip_app per transaction, so row-level security
// applies to them as in production.
import 'server-only'
import type { PGlite } from '@electric-sql/pglite'
import { Kysely, type PostgresPool, PostgresDialect } from 'kysely'
import type { Database } from './client'
import type { DB } from './types'

export const PGLITE_SCHEME = 'pglite://'

export function pgliteDataDir(url: string): string | undefined {
  const location = url.slice(PGLITE_SCHEME.length)
  return location === '' || location === 'memory' ? undefined : location
}

/** PGlite reports a damaged data directory only as "Aborted()": say what to do instead. */
export function pgliteOpenError(dataDir: string | undefined, cause: unknown): Error {
  const message = dataDir
    ? `The local database in ${dataDir} could not be opened; it may be damaged (for example after the process was killed). ` +
      `Stop the app, move ${dataDir} aside and run \`pnpm local:setup\` to rebuild it with the demo data.`
    : 'The in-memory database could not be started.'
  return new Error(message, { cause })
}

export function createPgliteDatabase(url: string): Database {
  const dataDir = pgliteDataDir(url)
  const ready: Promise<PGlite> = import('@/db/tooling/pglite')
    .then((tooling) => tooling.openMigratedPglite(dataDir))
    .catch((error: unknown) => {
      throw pgliteOpenError(dataDir, error)
    })
  // One pool instance for both Kysely clients, so they share the same lock.
  const pool: Promise<PostgresPool> = Promise.all([import('@/db/tooling/pglite-pool'), ready]).then(([tooling, db]) =>
    tooling.pglitePool(db),
  )
  const dialect = new PostgresDialect({ pool: () => pool })
  const app = new Kysely<DB>({ dialect })

  return {
    app,
    authDialect: dialect,
    channels: { listen: async (channel, onPayload) => (await ready).listen(channel, onPayload) },
    async close() {
      await app.destroy()
    },
  }
}
