// One-command local environment without Docker: `pnpm local:setup` (add `--reset` to start over).
// Creates .env.local for the in-process PGlite database if it does not exist, applies every
// migration to .pglite/dev and seeds the demo event starting today. Then run `pnpm dev`.
// Stop `pnpm dev` first: a PGlite data directory can only be opened by one process at a time.
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { Kysely, PostgresDialect } from 'kysely'
import { openMigratedPglite } from '@/db/tooling/pglite'
import { pglitePool } from '@/db/tooling/pglite-pool'
import { seedDevData } from '@/db/tooling/seed'
import { createAuth } from '@/lib/auth/auth'
import type { DB } from '@/lib/db/types'
import { generateTemporaryPassword } from '@/lib/domain/temporary-password'

const DATA_DIR = '.pglite/dev'
const ENV_FILE = '.env.local'
const APP_URL = 'http://localhost:3000'

async function ensureEnvFile(): Promise<string> {
  if (existsSync(ENV_FILE)) {
    const secret = process.env.BETTER_AUTH_SECRET
    if (!secret) {
      throw new Error(`${ENV_FILE} exists but has no BETTER_AUTH_SECRET; add one or delete the file and rerun.`)
    }
    if (!process.env.DATABASE_URL?.startsWith('pglite://')) {
      process.stdout.write(`Note: ${ENV_FILE} points DATABASE_URL elsewhere. Set it to pglite://${DATA_DIR} to use this database.\n`)
    }
    return secret
  }
  const secret = randomBytes(32).toString('base64')
  const lines = [
    '# Local development with the in-process PGlite database (created by pnpm local:setup).',
    `DATABASE_URL=pglite://${DATA_DIR}`,
    `SERVICE_DATABASE_URL=pglite://${DATA_DIR}`,
    `BETTER_AUTH_SECRET=${secret}`,
    `BETTER_AUTH_URL=${APP_URL}`,
    'API_ALLOWED_ORIGINS=',
    '# Lets `pnpm build && pnpm start` (and the end-to-end tests) run on PGlite locally.',
    'ALLOW_PGLITE=true',
    '',
  ]
  await writeFile(ENV_FILE, lines.join('\n'), { mode: 0o600 })
  process.stdout.write(`Created ${ENV_FILE}.\n`)
  return secret
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('local:setup is for development only.')
  }
  if (process.argv.includes('--reset')) {
    await rm(DATA_DIR, { recursive: true, force: true })
  }
  const secret = await ensureEnvFile()
  await mkdir(DATA_DIR, { recursive: true })
  const pglite = await openMigratedPglite(DATA_DIR)
  const dialect = new PostgresDialect({ pool: pglitePool(pglite) })
  const db = new Kysely<DB>({ dialect })

  try {
    const existing = await db.selectFrom('events').select('name').executeTakeFirst()
    if (existing) {
      process.stdout.write(`Already set up (${existing.name}). Run with --reset to start over.\n`)
      return
    }
    const auth = createAuth({ dialect, secret, baseURL: APP_URL, trustedOrigins: [APP_URL], secureCookies: false, rateLimit: false })
    const password = process.env.SEED_PASSWORD ?? generateTemporaryPassword()
    const result = await seedDevData(db, auth, password, { startsInDays: 0 })
    const lines = [
      `Seeded ${result.rooms} rooms, ${result.drivers} drivers, ${result.guests.delegations} delegations and ${result.guests.queued} registrations to review; the event starts today (${result.startsOn}).`,
      `A room plan for ${result.allocation.placed} guests waits for approval under Rooms → Allocation plan.`,
      'Sign in at http://localhost:3000 (all accounts share one password):',
      ...result.accounts.map((account) => `  ${account.role.padEnd(14)} ${account.email}`),
      `Password: ${password}`,
      'Next: pnpm dev',
    ]
    process.stdout.write(`${lines.join('\n')}\n`)
  } finally {
    await db.destroy()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`local:setup failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
