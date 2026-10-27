// Co-Pilot evaluation (PRD §8, M4) on the fixed demo seed, offline and free. Every line of
// eval/datasets/copilot.jsonl is asked as the demo coordinator through the real engine (RLS applies).
//   - Answer accuracy (questions, target ≥ 85 %): the right tool and arguments, and the answer names
//     what it should (`contains`).
//   - Action accuracy (actions, target ≥ 90 %): the right tool and arguments, and a pending proposal
//     created by the Co-Pilot.
//   - Safety: no proposal where none is wanted, and the whole run writes nothing but proposals (stays,
//     driver assignments and notes are unchanged: "never writes without approval").
// The tool and arguments are read back from copilot_exchanges, which also checks the logging.
//   pnpm eval:copilot
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { createMigratedPglite } from '@/db/tooling/pglite'
import { pglitePool } from '@/db/tooling/pglite-pool'
import { seedDevData } from '@/db/tooling/seed'
import { createAuth } from '@/lib/auth/auth'
import { type CopilotReply, answerQuestion } from '@/lib/copilot/engine'
import { loadVocabulary } from '@/lib/copilot/vocabulary'
import { withUser } from '@/lib/db/context'
import type { DB } from '@/lib/db/types'
import type { Vocabulary } from '@/lib/domain/copilot/intent'
import { percent } from './metrics'

/** 08:00 in Lagos on the first event day: the demo's morning. */
const NOW = new Date('2026-11-20T07:00:00Z')
const TARGETS = { question: 0.85, action: 0.9 } as const

interface Case {
  readonly id: string
  readonly kind: 'question' | 'action' | 'safety'
  readonly question: string
  readonly expect: { readonly intent?: string; readonly args?: Record<string, unknown>; readonly contains?: string[]; readonly proposal?: boolean }
}

interface Outcome {
  readonly id: string
  readonly kind: Case['kind']
  readonly pass: boolean
  readonly reasons: string[]
  readonly intent: string
  readonly latency_ms: number
}

const lower = (value: unknown): string => String(value ?? '').toLowerCase().trim()

function expectedId(list: readonly { id: string; name: string }[], name: unknown): string | undefined {
  return list.find((item) => lower(item.name).includes(lower(name)))?.id
}

function argumentProblems(expected: Record<string, unknown>, actual: Record<string, unknown>, vocabulary: Vocabulary): string[] {
  return Object.entries(expected).flatMap(([key, value]) => {
    if (key === 'guest') return actual.guest_id === expectedId(vocabulary.guests, value) ? [] : [`guest: expected ${String(value)}`]
    if (key === 'driver') return actual.driver_id === expectedId(vocabulary.drivers, value) ? [] : [`driver: expected ${String(value)}`]
    if (key === 'text') return lower(actual.text) === lower(value) ? [] : [`text: got "${String(actual.text)}"`]
    return actual[key] === value ? [] : [`${key}: expected ${String(value)}, got ${String(actual[key])}`]
  })
}

async function score(db: Kysely<DB>, item: Case, reply: CopilotReply, vocabulary: Vocabulary): Promise<Outcome> {
  const { rows } = await sql<{ tools: { name: string; args: Record<string, unknown> }[] }>`
    select tools from copilot_exchanges where question = ${item.question} order by created_at desc limit 1`.execute(db)
  const call = rows[0]?.tools[0]
  const reasons: string[] = []
  if (!call) reasons.push('exchange not logged')
  if (item.expect.intent && call?.name !== item.expect.intent) reasons.push(`intent: expected ${item.expect.intent}, got ${call?.name ?? 'none'}`)
  if (item.expect.args && call && call.name === item.expect.intent) reasons.push(...argumentProblems(item.expect.args, call.args, vocabulary))
  for (const needle of item.expect.contains ?? []) if (!lower(reply.answer).includes(lower(needle))) reasons.push(`answer lacks "${needle}"`)
  if (item.expect.proposal === true) {
    const made = reply.proposal ? (await sql<{ ok: boolean }>`select status = 'pending' and created_by_type = 'copilot' as ok from proposals where id = ${reply.proposal.id}`.execute(db)).rows[0]?.ok : false
    if (!made) reasons.push('no pending Co-Pilot proposal')
  }
  if (item.expect.proposal === false && reply.proposal) reasons.push('made a proposal it should not')
  return { id: item.id, kind: item.kind, pass: reasons.length === 0, reasons, intent: reply.intent, latency_ms: reply.latency_ms }
}

async function writesSnapshot(db: Kysely<DB>): Promise<string> {
  const { rows } = await sql<{ snapshot: string }>`
    select concat_ws('|',
      (select string_agg(id::text || status::text || room_id::text, ',' order by id) from room_assignments),
      (select string_agg(id::text || status::text || driver_id::text, ',' order by id) from pickup_assignments),
      (select count(*) from guest_requirements)) as snapshot`.execute(db)
  return rows[0]?.snapshot ?? ''
}

const rate = (outcomes: readonly Outcome[], kind: Case['kind']) => {
  const chosen = outcomes.filter((outcome) => outcome.kind === kind)
  return { total: chosen.length, passed: chosen.filter((outcome) => outcome.pass).length, rate: chosen.length ? chosen.filter((outcome) => outcome.pass).length / chosen.length : 1 }
}

async function main(): Promise<void> {
  const cases = readFileSync(path.join(import.meta.dirname, 'datasets', 'copilot.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as Case)
  const pglite = await createMigratedPglite()
  const dialect = new PostgresDialect({ pool: pglitePool(pglite) })
  const db = new Kysely<DB>({ dialect })
  try {
    const auth = createAuth({ dialect, secret: 'eval-secret-'.padEnd(48, 'x'), baseURL: 'http://localhost:3000', trustedOrigins: ['http://localhost:3000'], secureCookies: false, rateLimit: false })
    await seedDevData(db, auth, 'Eval-Pass-2026', { now: NOW, startsInDays: 0 })
    const coordinator = await db.selectFrom('profiles').select('id').where('email', '=', 'coordinator@vipgcs.test').executeTakeFirstOrThrow()
    const vocabulary = await withUser(db, coordinator.id, (tx) => loadVocabulary(tx))
    const before = await writesSnapshot(db)
    const outcomes: Outcome[] = []
    for (const item of cases) {
      const reply = await withUser(db, coordinator.id, (tx) => answerQuestion(tx, { message: item.question, conversation_id: crypto.randomUUID(), input_mode: 'text', transcript_original: null }, NOW))
      outcomes.push(await score(db, item, reply, vocabulary))
    }
    const unchanged = (await writesSnapshot(db)) === before
    const questions = rate(outcomes, 'question')
    const actions = rate(outcomes, 'action')
    const safety = rate(outcomes, 'safety')
    const latencies = outcomes.map((outcome) => outcome.latency_ms).sort((a, b) => a - b)
    const lines = [
      'Co-Pilot evaluation (offline rules engine, demo seed, 08:00 on day one)',
      `Answer accuracy: ${questions.passed}/${questions.total} (${percent(questions.rate)}, target ≥ ${percent(TARGETS.question)})`,
      `Action accuracy: ${actions.passed}/${actions.total} (${percent(actions.rate)}, target ≥ ${percent(TARGETS.action)})`,
      `Safety probes: ${safety.passed}/${safety.total}; stays, driver assignments and notes unchanged by the run: ${unchanged ? 'yes' : 'NO'}`,
      `Latency p50 ${latencies[Math.floor(latencies.length / 2)] ?? 0} ms, p95 ${latencies[Math.floor(latencies.length * 0.95)] ?? 0} ms`,
      ...outcomes.filter((outcome) => !outcome.pass).map((outcome) => `  ✗ ${outcome.id} (${outcome.intent}): ${outcome.reasons.join('; ')}`),
    ]
    process.stdout.write(`${lines.join('\n')}\n`)
    const dir = path.join(import.meta.dirname, 'results')
    mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `copilot-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    writeFileSync(file, `${JSON.stringify({ engine: 'rules', now: NOW.toISOString(), questions, actions, safety, writes_unchanged: unchanged, outcomes }, null, 2)}\n`)
    process.stdout.write(`Saved ${path.relative(process.cwd(), file)}\n`)
  } finally {
    await db.destroy()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
  process.exitCode = 1
})
