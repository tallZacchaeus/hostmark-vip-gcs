// Fills an empty development database with realistic data: `pnpm db:seed`.
// Accounts: <role>@vipgcs.test (e.g. coordinator@vipgcs.test, super.admin@vipgcs.test), all with
// the password printed at the end (or SEED_PASSWORD if set). Refuses to run in production.
import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import { seedDevData } from '@/db/tooling/seed'
import { getAuth } from '@/lib/auth/auth'
import { closeDatabase } from '@/lib/db/client'
import type { DB } from '@/lib/db/types'
import { generateTemporaryPassword } from '@/lib/domain/temporary-password'

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The dev seed must not run in production.')
  }
  const ownerUrl = process.env.DATABASE_MIGRATION_URL
  if (!ownerUrl) {
    throw new Error('DATABASE_MIGRATION_URL is not set (see .env.example).')
  }
  const password = process.env.SEED_PASSWORD ?? generateTemporaryPassword()
  const owner = new Kysely<DB>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: ownerUrl }) }) })

  try {
    const result = await seedDevData(owner, getAuth(), password)
    const lines = [
      `Seeded event ${result.eventId} starting ${result.startsOn}: ${result.rooms} rooms, ${result.drivers} drivers.`,
      `Transport: ${result.transport.assigned} trips assigned, ${result.transport.suggestions} driver suggestions waiting for approval.`,
      `Rooms: a plan placing ${result.allocation.placed} guests waits for approval at /rooms/plan/${result.allocation.planId}.`,
      'Accounts (all use the same password):',
      ...result.accounts.map((account) => `  ${account.role.padEnd(14)} ${account.email}`),
      `Password: ${password}`,
    ]
    process.stdout.write(`${lines.join('\n')}\n`)
  } finally {
    await owner.destroy()
    await closeDatabase()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Seed failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
