// Intake evaluation (PRD §8, M1): runs the free-text reader and the rule checks over
// eval/datasets/intake.jsonl and reports
//   - extraction: category precision / recall / F1, attention-flag accuracy, contradiction P/R
//   - problem detection: does a submission that needs a person go to review? (P / R / F1)
//   - auto-processing rate, predicted vs expected
//   - pasted messages: field F1 and per-field accuracy
// Offline rules by default (no network, no cost). `--reader claude` uses the Claude reader and
// needs ANTHROPIC_API_KEY; it then also reports tokens and latency.
//   pnpm eval:intake [--reader rules|claude] [--limit N]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createClaudeReader } from '@/lib/ai/claude-intake-reader'
import { type IntakeReader, rulesReader } from '@/lib/ai/intake-reader'
import { EMPTY_EXTRACTION } from '@/lib/domain/intake/extraction'
import { normalizeFlightNumber, normalizeIntake } from '@/lib/domain/intake/normalize'
import { intakeFieldsSchema } from '@/lib/domain/intake/schema'
import { type EventWindow, isHighConfidence, validateIntake } from '@/lib/domain/intake/validate'
import { type Counts, ZERO, add, matchField, matchLabels, percent, scores } from './metrics'

interface ExpectedItem {
  readonly category: string
  readonly needs_attention: boolean
  readonly conflicts_with: string | null
}

interface NoteItem {
  readonly id: string
  readonly kind: 'note'
  readonly event: EventWindow
  readonly form: unknown
  readonly expected: { readonly items: ExpectedItem[]; readonly needs_review: boolean }
}

interface MessageItem {
  readonly id: string
  readonly kind: 'message'
  readonly event: EventWindow
  readonly text: string
  readonly year: number
  readonly expected: { readonly fields: Record<string, string | number> }
}

type Item = NoteItem | MessageItem

const TIME_ZONE = 'Africa/Lagos'
const MESSAGE_FIELDS = ['title', 'full_name', 'flight_number', 'arrival_date', 'arrival_time', 'arrival_mode', 'party_size'] as const

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

function chooseReader(): { reader: IntakeReader; name: string } {
  if (argument('reader') !== 'claude') return { reader: rulesReader, name: 'rules' }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('--reader claude needs ANTHROPIC_API_KEY (no key is configured; the default reader is offline)')
  const model = process.env.INTAKE_AI_MODEL ?? 'claude-opus-5-5'
  return { reader: createClaudeReader({ apiKey, model, fallback: rulesReader }), name: `claude:${model}` }
}

const tidy = (value: string): string => value.toLowerCase().replace(/[.\s]+/g, ' ').trim()

interface NoteTally {
  categories: Counts
  conflicts: Counts
  review: Counts & { tn: number }
  attentionRight: number
  attentionTotal: number
  autoPredicted: number
  autoExpected: number
  tokens: number
  latencyMs: number
}

async function scoreNote(item: NoteItem, reader: IntakeReader, tally: NoteTally): Promise<void> {
  const fields = intakeFieldsSchema.parse(item.form)
  const intake = normalizeIntake(fields, TIME_ZONE)
  const extraction = fields.others ? await reader.readOthers(fields.others, { flight_number: intake.flight_number, party_size: intake.party.length }) : EMPTY_EXTRACTION
  const issues = validateIntake(fields, intake, item.event, extraction)
  const needsReview = !isHighConfidence(issues, 'none')

  tally.categories = add(tally.categories, matchLabels(item.expected.items.map((entry) => entry.category), extraction.items.map((entry) => entry.category)))
  tally.conflicts = add(
    tally.conflicts,
    matchLabels(
      item.expected.items.flatMap((entry) => (entry.conflicts_with ? [entry.conflicts_with] : [])),
      extraction.items.flatMap((entry) => (entry.conflicts_with ? [entry.conflicts_with] : [])),
    ),
  )
  for (const expected of item.expected.items) {
    const found = extraction.items.find((entry) => entry.category === expected.category)
    if (!found) continue
    tally.attentionTotal += 1
    if (found.needs_attention === expected.needs_attention) tally.attentionRight += 1
  }
  const actual = item.expected.needs_review
  tally.review = {
    tp: tally.review.tp + (actual && needsReview ? 1 : 0),
    fp: tally.review.fp + (!actual && needsReview ? 1 : 0),
    fn: tally.review.fn + (actual && !needsReview ? 1 : 0),
    tn: tally.review.tn + (!actual && !needsReview ? 1 : 0),
  }
  tally.autoPredicted += needsReview ? 0 : 1
  tally.autoExpected += actual ? 0 : 1
  tally.tokens += (extraction.input_tokens ?? 0) + (extraction.output_tokens ?? 0)
  tally.latencyMs += extraction.latency_ms ?? 0
}

async function scoreMessage(item: MessageItem, reader: IntakeReader, perField: Map<string, Counts>): Promise<void> {
  const reading = await reader.readMessage(item.text, { year: item.year, event_name: 'Evaluation event' })
  const predicted: Record<(typeof MESSAGE_FIELDS)[number], string> = {
    title: tidy(reading.fields.title ?? ''),
    full_name: tidy(reading.fields.full_name ?? ''),
    flight_number: normalizeFlightNumber(reading.fields.flight_number ?? '') ?? '',
    arrival_date: reading.fields.arrival_date ?? '',
    arrival_time: reading.fields.arrival_time ?? '',
    arrival_mode: reading.fields.arrival_mode ?? '',
    party_size: String(reading.fields.party?.length ?? 0),
  }
  for (const field of MESSAGE_FIELDS) {
    const raw = String(item.expected.fields[field] ?? '')
    const expected = field === 'title' || field === 'full_name' ? tidy(raw) : raw
    perField.set(field, add(perField.get(field) ?? ZERO, matchField(expected, predicted[field])))
  }
}

async function main(): Promise<void> {
  const { reader, name } = chooseReader()
  const limit = Number(argument('limit') ?? Number.POSITIVE_INFINITY)
  const file = path.join(process.cwd(), 'eval', 'datasets', 'intake.jsonl')
  const items = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Item)
    .slice(0, limit)

  const tally: NoteTally = { categories: ZERO, conflicts: ZERO, review: { ...ZERO, tn: 0 }, attentionRight: 0, attentionTotal: 0, autoPredicted: 0, autoExpected: 0, tokens: 0, latencyMs: 0 }
  const perField = new Map<string, Counts>()
  for (const item of items) {
    if (item.kind === 'note') await scoreNote(item, reader, tally)
    else await scoreMessage(item, reader, perField)
  }

  const notes = items.filter((item) => item.kind === 'note').length
  const messages = items.length - notes
  const fieldTotals = [...perField.values()].reduce(add, ZERO)
  const result = {
    reader: name,
    ran_at: new Date().toISOString(),
    dataset: { notes, messages },
    extraction: { categories: scores(tally.categories), counts: tally.categories, attention_accuracy: tally.attentionTotal ? tally.attentionRight / tally.attentionTotal : 1, contradictions: scores(tally.conflicts) },
    problem_detection: { ...scores(tally.review), counts: tally.review },
    auto_processing_rate: { predicted: notes ? tally.autoPredicted / notes : 0, expected: notes ? tally.autoExpected / notes : 0 },
    messages: { fields: scores(fieldTotals), per_field: Object.fromEntries([...perField].map(([field, counts]) => [field, scores(counts)])) },
    cost: { tokens: tally.tokens, mean_latency_ms: notes ? Math.round(tally.latencyMs / notes) : 0 },
  }

  const outDir = path.join(process.cwd(), 'eval', 'results')
  mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, `intake-${name.replace(/[^a-z0-9.-]+/gi, '-')}.json`)
  writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`)

  const row = (label: string, value: string) => `| ${label} | ${value} |`
  process.stdout.write(
    [
      `## Intake evaluation (${name}): ${notes} notes, ${messages} messages`,
      '',
      '| Metric | Value |',
      '|---|---|',
      row('Category F1 (P / R)', `${percent(result.extraction.categories.f1)} (${percent(result.extraction.categories.precision)} / ${percent(result.extraction.categories.recall)})`),
      row('Attention flag accuracy', percent(result.extraction.attention_accuracy)),
      row('Contradiction F1', percent(result.extraction.contradictions.f1)),
      row('Problem detection F1 (P / R)', `${percent(result.problem_detection.f1)} (${percent(result.problem_detection.precision)} / ${percent(result.problem_detection.recall)})`),
      row('Auto-processed (predicted / expected)', `${percent(result.auto_processing_rate.predicted)} / ${percent(result.auto_processing_rate.expected)}`),
      row('Pasted message field F1', percent(result.messages.fields.f1)),
      ...MESSAGE_FIELDS.map((field) => row(`  ${field}`, percent(result.messages.per_field[field]?.f1 ?? 0))),
      row('Tokens / mean latency', `${result.cost.tokens} / ${result.cost.mean_latency_ms} ms`),
      '',
      `Saved ${path.relative(process.cwd(), outFile)}`,
      '',
    ].join('\n'),
  )
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
