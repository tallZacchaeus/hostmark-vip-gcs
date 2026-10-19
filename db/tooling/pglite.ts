// In-process Postgres (PGlite) with the project's migrations applied.
// Used by the DB tests, the integration tests and `pnpm db:types`. Never imported by the app.
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'

const EXTENSIONS = { btree_gist, pg_trgm }

// Relative to the project root (scripts, tests and the app all run from there), which also keeps
// the bundler from tracing the whole project when the app imports this in pglite:// mode.
const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations')
const UP_MARKER = '-- migrate:up'
const DOWN_MARKER = '-- migrate:down'

// Postgres type OIDs whose text form we keep as strings, matching node-pg in the app
// (lib/db/client.ts): bigint and numeric would lose precision as numbers, and a `date`
// has no time zone, so it must not become a JS Date.
const INT8_OID = 20
const DATE_OID = 1082
const NUMERIC_OID = 1700
const keepText = (value: string): string => value

export interface Migration {
  readonly name: string
  readonly up: string
}

/** Reads dbmate migration files in order and returns their "up" sections. */
export async function readMigrations(dir: string = MIGRATIONS_DIR): Promise<readonly Migration[]> {
  // turbopackIgnore: only used in pglite:// development mode, where the repository is on disk.
  const files = (await readdir(/* turbopackIgnore: true */ dir)).filter((file) => file.endsWith('.sql')).sort()
  return Promise.all(
    files.map(async (name) => {
      const text = await readFile(path.join(/* turbopackIgnore: true */ dir, name), 'utf8')
      const upStart = text.indexOf(UP_MARKER)
      if (upStart === -1) {
        throw new Error(`Migration ${name} has no "${UP_MARKER}" section`)
      }
      const downStart = text.indexOf(DOWN_MARKER)
      const up = text.slice(upStart + UP_MARKER.length, downStart === -1 ? undefined : downStart)
      return { name, up }
    }),
  )
}

async function applyMigration(db: PGlite, migration: Migration, record: string): Promise<void> {
  try {
    await db.exec(`begin;\n${migration.up}\n${record}\ncommit;`)
  } catch (error: unknown) {
    await db.exec('rollback').catch(() => undefined)
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Migration ${migration.name} failed: ${reason}`)
  }
}

function openPglite(dataDir?: string): Promise<PGlite> {
  return PGlite.create({
    dataDir,
    extensions: EXTENSIONS,
    parsers: { [INT8_OID]: keepText, [DATE_OID]: keepText, [NUMERIC_OID]: keepText },
  })
}

/** Creates an in-memory database and applies every migration, each in its own transaction. */
export async function createMigratedPglite(): Promise<PGlite> {
  const db = await openPglite()
  for (const migration of await readMigrations()) {
    await applyMigration(db, migration, '')
  }
  return db
}

/** "20261016100000_foundation.sql" → "20261016100000" (dbmate's version key). */
export function migrationVersion(name: string): string {
  return name.split('_')[0] ?? name
}

/**
 * Opens (or creates) a database, in memory or in `dataDir`, and applies only the migrations it
 * has not recorded yet, in dbmate's schema_migrations table. Used by the `pglite://` development
 * mode (lib/db/pglite-database.ts) and `pnpm local:setup`.
 */
export async function openMigratedPglite(dataDir?: string): Promise<PGlite> {
  const db = await openPglite(dataDir)
  await db.exec('create table if not exists public.schema_migrations (version varchar(128) primary key)')
  const { rows } = await db.query<{ version: string }>('select version from public.schema_migrations')
  const applied = new Set(rows.map((row) => row.version))
  for (const migration of await readMigrations()) {
    const version = migrationVersion(migration.name)
    if (!applied.has(version)) {
      await applyMigration(db, migration, `insert into public.schema_migrations (version) values ('${version}');`)
    }
  }
  return db
}
