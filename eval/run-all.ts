// `pnpm eval:all`: runs every module evaluation in turn (each writes its own JSON to eval/results/)
// and gathers their printed summaries into eval/results/summary.md for the report (06 P8).
// Stops on the first failure, so the summary never mixes fresh and stale figures.
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const EVALS = [
  { script: 'eval:intake', module: 'M1 Guest intake' },
  { script: 'eval:cascade', module: 'M2 Flights and transport' },
  { script: 'eval:allocation', module: 'M3 Room allocation' },
  { script: 'eval:copilot', module: 'M4 Co-Pilot' },
  { script: 'eval:cleaning', module: 'M5 Turnaround and cleaning' },
] as const

const RESULTS_DIR = path.join(import.meta.dirname, 'results')
// pnpm's own notices (e.g. a failed update check offline) are not part of an evaluation's output.
const PNPM_NOISE = /^\s*(\[?ERR_PNPM|WARN|>|\$ )/

function run(script: string): { ok: boolean; output: string } {
  const result = spawnSync('pnpm', ['run', '--silent', script], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    .split('\n')
    .filter((line) => !PNPM_NOISE.test(line))
    .join('\n')
    .trim()
  return { ok: result.status === 0, output }
}

function main(): void {
  mkdirSync(RESULTS_DIR, { recursive: true })
  const sections = [`# Evaluation summary\n\nRun ${new Date().toISOString()}. Each evaluation also wrote its full results as JSON in eval/results/.`]
  for (const { script, module } of EVALS) {
    process.stdout.write(`Running ${script} (${module})…\n`)
    const { ok, output } = run(script)
    sections.push(`## ${module} — \`pnpm ${script}\`\n\n\`\`\`text\n${output}\n\`\`\``)
    if (!ok) {
      writeFileSync(path.join(RESULTS_DIR, 'summary.md'), `${sections.join('\n\n')}\n\n**Stopped: ${script} failed.**\n`)
      process.stderr.write(`${script} failed; see eval/results/summary.md\n`)
      process.exit(1)
    }
  }
  writeFileSync(path.join(RESULTS_DIR, 'summary.md'), `${sections.join('\n\n')}\n`)
  process.stdout.write('All evaluations passed; summary in eval/results/summary.md\n')
}

main()
