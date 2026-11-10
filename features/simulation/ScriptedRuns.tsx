'use client'
// Scripted scenarios (FR-PL-10, FR-FT-10): replay scripted flight and room changes (a delay, a room
// out of service, extra guests) through the same services as live data, at up to 600× speed. Unlike the what-if preview this does change
// data — in simulated mode only — and every resulting decision still waits for approval.
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useToast } from '@/components/ui/Toast'
import { useNow } from '@/components/shell/useNow'
import { apiSend, errorMessage } from '@/lib/client/api'
import { formatTime } from '@/lib/client/format'
import { refreshApi, useApi } from '@/lib/client/use-api'
import { virtualNow } from '@/lib/domain/clock'
import { type RunSummary, SPEEDS, type SimulationOptions, runTargets } from './types'

const RUNS_PATH = '/api/simulation/runs'
const RUNNING_REFRESH_MS = 3_000

function RunRow({ run, timeZone, now, busy, onStop }: { readonly run: RunSummary; readonly timeZone: string; readonly now: Date | null; readonly busy: boolean; readonly onStop: () => void }) {
  const running = run.status === 'running'
  const clock = running && now ? virtualNow({ virtualStart: new Date(run.virtual_start), realStart: new Date(run.real_start), speed: run.speed }, now) : null
  return (
    <div className={`simulation-run-row ${running ? 'is-running' : ''}`}>
      <div>
        <b>{run.title}</b>
        <small>
          {runTargets(run) || 'Nothing to act on'} · step {run.steps_applied} of {run.steps_total} · {run.speed}×
        </small>
      </div>
      {running ? (
        <span className="simulation-run-clock" title="Simulated time">
          <Icon name="clock" size={15} />
          {clock ? formatTime(clock, timeZone) : '–'}
        </span>
      ) : (
        <span className={`arrival-badge arrival-badge--${run.status === 'completed' ? 'success' : 'neutral'}`}>{run.status === 'completed' ? 'Finished' : 'Stopped'}</span>
      )}
      {running ? (
        <Button busy={busy} onClick={onStop}>
          Stop
        </Button>
      ) : null}
    </div>
  )
}

export function ScriptedRuns({ options }: { readonly options: SimulationOptions }) {
  const toast = useToast()
  const now = useNow(1_000)
  const [scenario, setScenario] = useState(options.scenarios[0]?.key ?? '')
  const [speed, setSpeed] = useState(60)
  const [busy, setBusy] = useState(false)
  const runs = useApi<{ runs: RunSummary[] }>(RUNS_PATH, { refreshInterval: RUNNING_REFRESH_MS })
  const list = runs.data?.runs ?? []
  const active = list.find((run) => run.status === 'running')
  const chosen = options.scenarios.find((item) => item.key === scenario)
  const simulated = options.flight_mode === 'simulated'

  const act = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true)
    try {
      await work()
      toast.show({ message })
    } catch (caught: unknown) {
      toast.show({ message: errorMessage(caught), tone: 'error' })
    } finally {
      setBusy(false)
      await refreshApi(RUNS_PATH, '/api/arrivals', '/api/transport', '/api/decisions', '/api/rooms/board', '/api/guests')
    }
  }

  return (
    <section className="simulation-scripted card-v4" aria-labelledby="scripted-title">
      <header>
        <h2 id="scripted-title">Scripted scenarios</h2>
        <p>Replays flight and room changes through the live pipeline. Decisions still wait for your approval.</p>
      </header>
      {!simulated ? (
        <p className="simulation-note">
          <Icon name="info" size={16} />
          Scripted runs need simulated flight data. A Super Admin can switch it in Settings → System.
        </p>
      ) : null}
      <div className="simulation-scripted-form">
        <label className="simulation-field">
          <span>Scenario</span>
          <select value={scenario} onChange={(event) => setScenario(event.target.value)} disabled={!simulated}>
            {options.scenarios.map((item) => (
              <option key={item.key} value={item.key}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label className="simulation-field">
          <span>Speed</span>
          <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))} disabled={!simulated}>
            {SPEEDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button kind="primary" icon="play" busy={busy && !active} disabled={!simulated || Boolean(active) || !scenario} onClick={() => void act(() => apiSend(RUNS_PATH, 'POST', { scenario_key: scenario, speed }), `Started: ${chosen?.title ?? scenario}`)}>
          Start
        </Button>
      </div>
      {chosen ? <p className="simulation-scenario-description">{chosen.description}</p> : null}
      <div className="simulation-runs">
        {list.length === 0 ? <p className="simulation-note">No runs yet.</p> : null}
        {list.map((run) => (
          <RunRow key={run.id} run={run} timeZone={options.timezone} now={now} busy={busy} onStop={() => void act(() => apiSend(`${RUNS_PATH}/${run.id}/stop`, 'POST', {}), 'Simulation stopped.')} />
        ))}
      </div>
    </section>
  )
}
