// Makes a PGlite instance look like a node-pg pool with exactly one connection, so Kysely's
// PostgresDialect (and Better Auth, which builds on Kysely) can run on it in tests and tooling.
// PGlite has a single session: the mutex makes a second "connection" wait for the first to be
// released, exactly like a real pool of size 1, instead of interleaving two transactions.
import type { PGlite } from '@electric-sql/pglite'
import type { PostgresPool, PostgresPoolClient, PostgresQueryResult } from 'kysely'

type QueryCommand = PostgresQueryResult<unknown>['command']

export function pglitePool(db: PGlite): PostgresPool {
  let queue: Promise<void> = Promise.resolve()

  async function acquire(): Promise<() => void> {
    let release: () => void = () => undefined
    const next = new Promise<void>((resolve) => {
      release = resolve
    })
    const previous = queue
    queue = previous.then(() => next)
    await previous
    return release
  }

  return {
    options: {},
    async connect(): Promise<PostgresPoolClient> {
      const release = await acquire()
      const client = {
        async query<R>(sql: string, parameters: ReadonlyArray<unknown>): Promise<PostgresQueryResult<R>> {
          const result = await db.query<R>(sql, [...parameters])
          return {
            command: (result.command ?? 'SELECT') as QueryCommand,
            rowCount: result.affectedRows ?? result.rows.length,
            rows: result.rows,
          }
        },
        release,
      }
      return client as unknown as PostgresPoolClient
    },
    async end(): Promise<void> {
      await db.close()
    },
  }
}
