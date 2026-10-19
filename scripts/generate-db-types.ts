// Generates lib/db/types.ts (Kysely table types) from the migration files.
// Applies db/migrations to an in-memory PGlite and introspects it with kysely-codegen's
// programmatic API, so the types never depend on a dev database's state.
// Run with `pnpm db:types` (plain Node; no server or socket needed).
import path from 'node:path'
import { Kysely, PostgresDialect } from 'kysely'
import { generate, PostgresDialect as CodegenPostgresDialect } from 'kysely-codegen'
import { createMigratedPglite } from '../db/tooling/pglite.ts'
import { pglitePool } from '../db/tooling/pglite-pool.ts'

const OUT_FILE = path.join(import.meta.dirname, '..', 'lib', 'db', 'types.ts')

async function main(): Promise<void> {
  const pglite = await createMigratedPglite()
  const db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool: pglitePool(pglite) }) })

  try {
    await generate({
      db,
      dialect: new CodegenPostgresDialect({ dateParser: 'string', numericParser: 'string' }),
      outFile: OUT_FILE,
      excludePattern: 'public.schema_migrations',
      defaultSchemas: ['public'],
    })
  } finally {
    await db.destroy()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Type generation failed: ${error instanceof Error ? error.stack : String(error)}\n`)
  process.exit(1)
})
