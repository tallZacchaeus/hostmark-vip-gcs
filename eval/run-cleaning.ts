// Cleaning evaluation (PRD §8, M5). Two parts, no network and no cost:
//   1. Flow reliability, on an in-memory database with every migration: N parties checked in, then
//      checked out one by one through public.check_out_party as front-desk staff. A trial passes
//      when, as soon as the check-out commits, each emptied room has a pending cleaning task and
//      every housekeeper has a notification for it, within 5 s (target ≥ 99 %). Delivery to an open
//      phone then goes through the same notification stream as every other alert.
//   2. Estimate error: the seeded turnaround simulation (eval/cleaning.ts), 40 check-outs over a
//      5-hour peak and over an 8-hour day, with 3–8 cleaners; MAE between the FR-CL-03 estimate and
//      the actual ready time (target ≤ 15 min). The formula ignores the queue ahead of a room, so it
//      holds only while housekeeping keeps up — the sweep shows where that stops.
//   pnpm eval:cleaning [--trials N] [--seed N]
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { createMigratedPglite } from '@/db/tooling/pglite'
import { pglitePool } from '@/db/tooling/pglite-pool'
import type { DB } from '@/lib/db/types'
import { simulateTurnaround } from './cleaning'

const TARGET_MS = 5_000
const TARGET_RATE = 0.99
const TARGET_MAE_MIN = 15
const HOUSEKEEPERS = 3
const CHECKOUTS = 40
const SPREADS = [300, 480] as const
const CLEANERS = [3, 4, 6, 8] as const

function argument(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`)
  const value = index === -1 ? Number.NaN : Number(process.argv[index + 1])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const percentile = (sorted: readonly number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0

async function arrange(db: Kysely<DB>, trials: number): Promise<{ frontDesk: string; parties: string[] }> {
  await sql`insert into events (name, venue_name, timezone, starts_on, ends_on) values ('Eval', 'Venue', 'UTC', '2026-11-20', '2026-11-23')`.execute(db)
  const type = await db.insertInto('room_types').values({ name: 'Standard', tier: 2, default_capacity: 2, cleaning_minutes: 30 }).returning('id').executeTakeFirstOrThrow()
  const profile = (role: 'accommodation' | 'housekeeping', index: number) =>
    db.insertInto('profiles').values({ full_name: `${role} ${index}`, email: `${role}${index}@eval.test`, role, must_change_password: false }).returning('id').executeTakeFirstOrThrow()
  const frontDesk = await profile('accommodation', 0)
  for (let index = 0; index < HOUSEKEEPERS; index += 1) await profile('housekeeping', index)
  // On the event's team, as accounts created in the app would be (P9: staff work only on their events).
  await sql`insert into event_members (event_id, profile_id) select e.id, p.id from events e cross join profiles p`.execute(db)
  const parties: string[] = []
  for (let index = 0; index < trials; index += 1) {
    const room = await db.insertInto('rooms').values({ number: String(1000 + index), floor: 1, wing: 'East', room_type_id: type.id, capacity: 2 }).returning('id').executeTakeFirstOrThrow()
    const delegation = await db.insertInto('delegations').values({ name: `Party ${index}` }).returning('id').executeTakeFirstOrThrow()
    const guest = await db.insertInto('guests').values({ delegation_id: delegation.id, member_role: 'principal', full_name: `Guest ${index}`, status: 'checked_in' }).returning('id').executeTakeFirstOrThrow()
    await sql`insert into room_assignments (room_id, guest_id, expected_check_in_at, expected_check_out_at, status, checked_in_at)
      values (${room.id}, ${guest.id}, now() - interval '1 day', now() + interval '1 hour', 'checked_in', now() - interval '1 day')`.execute(db)
    parties.push(delegation.id)
  }
  return { frontDesk: frontDesk.id, parties }
}

async function trial(db: Kysely<DB>, frontDesk: string, delegation: string): Promise<{ ok: boolean; ms: number }> {
  const started = performance.now()
  await db.transaction().execute(async (tx) => {
    await sql`set local role vip_app`.execute(tx)
    await sql`select set_config('app.user_id', ${frontDesk}, true)`.execute(tx)
    await sql`select public.check_out_party(${delegation}::uuid)`.execute(tx)
  })
  const { rows } = await sql<{ tasks: number; notes: number }>`
    select count(distinct t.id)::int as tasks, count(n.id)::int as notes
    from room_assignments a
    join guests g on g.id = a.guest_id
    join cleaning_tasks t on t.room_id = a.room_id and t.status = 'pending'
    left join notifications n on n.entity_id = t.id and n.kind = 'room_needs_cleaning'
    where g.delegation_id = ${delegation}`.execute(db)
  const ms = performance.now() - started
  const found = rows[0]
  return { ok: found?.tasks === 1 && found.notes === HOUSEKEEPERS && ms <= TARGET_MS, ms }
}

async function reliability(trials: number) {
  const pglite = await createMigratedPglite()
  const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool: pglitePool(pglite) }) })
  try {
    const { frontDesk, parties } = await arrange(db, trials)
    const results = []
    for (const party of parties) results.push(await trial(db, frontDesk, party))
    const times = results.map((result) => result.ms).sort((a, b) => a - b)
    const ok = results.filter((result) => result.ok).length
    return { trials, ok, rate: ok / trials, p50_ms: percentile(times, 0.5), p95_ms: percentile(times, 0.95), max_ms: times.at(-1) ?? 0 }
  } finally {
    await db.destroy()
  }
}

async function main(): Promise<void> {
  const trials = argument('trials', 100)
  const seed = argument('seed', 42)
  const flow = await reliability(trials)
  const estimate = SPREADS.flatMap((spread) =>
    CLEANERS.map((cleaners) => {
      const result = simulateTurnaround({ seed, checkouts: CHECKOUTS, cleaners, bufferMinutes: 15, spreadMinutes: spread, durationFactor: [0.8, 1.3] })
      return { spread_hours: spread / 60, cleaners, mae_min: Number(result.maeMinutes.toFixed(1)), p90_min: Number(result.p90Minutes.toFixed(1)), rooms_late: result.late, rooms: result.rooms }
    }),
  )

  const lines = [
    `Cleaning evaluation (seed ${seed})`,
    `Flow reliability: ${flow.ok}/${flow.trials} (${(flow.rate * 100).toFixed(1)}%, target ≥ ${TARGET_RATE * 100}%) · check-out → task + notifications p50 ${flow.p50_ms.toFixed(0)} ms, p95 ${flow.p95_ms.toFixed(0)} ms, max ${flow.max_ms.toFixed(0)} ms`,
    `Estimate error (FR-CL-03 at check-out vs actual ready), ${CHECKOUTS} check-outs, target MAE ≤ ${TARGET_MAE_MIN} min:`,
    ...estimate.map(
      (row) =>
        `  over ${row.spread_hours} h, ${row.cleaners} cleaners: MAE ${row.mae_min} min${row.mae_min <= TARGET_MAE_MIN ? ' ✓' : ''}, p90 ${row.p90_min} min, ${row.rooms_late} rooms ready after their next guests`,
    ),
  ]
  process.stdout.write(`${lines.join('\n')}\n`)
  const dir = path.join(import.meta.dirname, 'results')
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `cleaning-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, `${JSON.stringify({ seed, reliability: flow, estimate }, null, 2)}\n`)
  process.stdout.write(`Saved ${path.relative(process.cwd(), file)}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
  process.exitCode = 1
})
