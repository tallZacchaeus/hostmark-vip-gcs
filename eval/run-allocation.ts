// Room allocation evaluation (PRD §8, M3): runs the real allocator on seeded synthetic venues and
// guest lists and reports, per scenario and over all seeds,
//   - hard-rule satisfaction (target 100%), checked independently by eval/allocation.ts
//   - weighted preference satisfaction vs the naive "first free room" baseline, and vs the same
//     allocator without its swap pass (how much the local search adds)
//   - guests placed, and runtime per plan
// Pure TypeScript: no database, no network, no cost. The same --seed gives the same instances.
//   pnpm eval:allocation [--seeds N] [--seed N]
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { type AllocationInput, type AllocationPlan, allocate, allocateFirstFree } from '@/lib/domain/rooms/allocator'
import { type Scenario, buildInstance, hardRuleViolations } from './allocation'

const SCENARIOS: readonly Scenario[] = [
  // The seeded venue two days out: rooms to spare, dirty rooms have time to be cleaned.
  { name: 'venue-two-days-out', floors: 6, delegations: 30, now_offset_h: -48 },
  // Arrival morning with a full house: dirty rooms are not ready for the earliest guests.
  { name: 'arrival-morning-full', floors: 6, delegations: 40, now_offset_h: 6 },
  // More guests than beds in a small hotel: some guests must go unplaced, rules still hold.
  { name: 'small-hotel-overbooked', floors: 3, delegations: 25, now_offset_h: -24 },
]

function argument(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`)
  const value = index === -1 ? Number.NaN : Number(process.argv[index + 1])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
const pct = (value: number): number => Math.round(value * 1000) / 10

interface Run {
  readonly guests: number
  readonly placed: number
  readonly violations: number
  readonly satisfaction: number
  readonly greedy: number
  readonly baseline: number
  readonly baseline_placed: number
  readonly baseline_violations: number
  readonly ms: number
}

function timed(input: AllocationInput): { readonly plan: AllocationPlan; readonly ms: number } {
  const start = performance.now()
  const plan = allocate(input)
  return { plan, ms: performance.now() - start }
}

function runOnce(scenario: Scenario, seed: number): Run {
  const input = buildInstance(scenario, seed)
  const { plan, ms } = timed(input)
  const baseline = allocateFirstFree(input)
  return {
    guests: input.guests.length,
    placed: plan.placed,
    violations: hardRuleViolations(input, plan).length,
    satisfaction: plan.satisfaction,
    greedy: allocate({ ...input, passes: 0 }).satisfaction,
    baseline: baseline.satisfaction,
    baseline_placed: baseline.placed,
    baseline_violations: hardRuleViolations(input, baseline).length,
    ms,
  }
}

function summarise(scenario: Scenario, runs: readonly Run[]) {
  const guests = runs.reduce((sum, run) => sum + run.guests, 0)
  const placed = runs.reduce((sum, run) => sum + run.placed, 0)
  const violations = runs.reduce((sum, run) => sum + run.violations, 0)
  return {
    scenario: scenario.name,
    runs: runs.length,
    guests_per_run: Math.round(guests / runs.length),
    hard_rules: { violations, satisfied_pct: placed === 0 ? 100 : pct((placed - violations) / placed), baseline_violations: runs.reduce((sum, run) => sum + run.baseline_violations, 0) },
    placed_pct: { allocator: pct(placed / guests), baseline: pct(runs.reduce((sum, run) => sum + run.baseline_placed, 0) / guests) },
    preference_pct: {
      allocator: pct(mean(runs.map((run) => run.satisfaction))),
      without_swaps: pct(mean(runs.map((run) => run.greedy))),
      baseline: pct(mean(runs.map((run) => run.baseline))),
      gap_vs_baseline_pts: pct(mean(runs.map((run) => run.satisfaction - run.baseline))),
    },
    runtime_ms: { mean: Math.round(mean(runs.map((run) => run.ms)) * 10) / 10, max: Math.round(Math.max(...runs.map((run) => run.ms)) * 10) / 10 },
  }
}

function main(): void {
  const seeds = argument('seeds', 10)
  const firstSeed = argument('seed', 1)
  const scenarios = SCENARIOS.map((scenario) => summarise(scenario, Array.from({ length: seeds }, (_, index) => runOnce(scenario, firstSeed + index))))
  const report = {
    seeds: { first: firstSeed, count: seeds },
    targets: { hard_rules_pct: 100, preference: 'clearly above the first-free-room baseline' },
    meets_targets: scenarios.every((scenario) => scenario.hard_rules.violations === 0 && scenario.preference_pct.gap_vs_baseline_pts > 0),
    scenarios,
  }
  const dir = path.join(import.meta.dirname, 'results')
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `allocation-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\nSaved ${path.relative(process.cwd(), file)}\n`)
  if (!report.meets_targets) process.exitCode = 1
}

main()
