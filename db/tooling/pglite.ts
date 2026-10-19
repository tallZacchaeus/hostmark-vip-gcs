// In-process Postgres (PGlite) with the project's migrations applied.
// Used by the DB tests, the integration tests and `pnpm db:types`. Never imported by the app.
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const MIGRATIONS_DIR = path.join(import.meta.dirname, '..', 'migrations')
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
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort()
  return Promise.all(
    files.map(async (name) => {
      const text = await readFile(path.join(dir, name), 'utf8')
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

/** Creates an in-memory database and applies every migration, each in its own transaction. */
export async function createMigratedPglite(): Promise<PGlite> {
  const db = await PGlite.create({
    extensions: { btree_gist },
    parsers: { [INT8_OID]: keepText, [DATE_OID]: keepText, [NUMERIC_OID]: keepText },
  })
  for (const migration of await readMigrations()) {
    try {
      await db.exec(`begin;\n${migration.up}\ncommit;`)
    } catch (error: unknown) {
      await db.exec('rollback').catch(() => undefined)
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`Migration ${migration.name} failed: ${reason}`)
    }
  }
  return db
}
