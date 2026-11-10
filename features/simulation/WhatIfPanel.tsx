'use client'
// What-if preview (Figma "Simulation"): pick a flight delay, a driver dropping out or a room going
// out of service and see what the live planner would change — moved pickups, drivers kept, room
// moves, decisions and conflicts. Nothing is written. Extra guests run as a scripted scenario.
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Skeleton } from '@/components/ui/Status'
import { apiSend, errorMessage } from '@/lib/client/api'
import { dateKey, formatIsoDate, formatTime, plural, zonedDateTime } from '@/lib/client/format'
import { LINE_ICONS, type SimulationOptions, type WhatIfResult } from './types'

type Scenario = 'flight_delay' | 'driver_unavailable' | 'room_out_of_service'
const DELAY_CHIPS = [30, 60, 90, 120] as const

function Results({ result, running, failed, onRetry, onDiscard }: { readonly result: WhatIfResult | null; readonly running: boolean; readonly failed: string | null; readonly onRetry: () => void; readonly onDiscard: () => void }) {
  const conflicts = result?.lines.filter((line) => line.kind === 'alert').length ?? 0
  return (
    <section className="simulation-results-card" aria-live="polite">
      <header>
        <h2>What would change</h2>
        {result && !running ? (
          <span>
            {plural(result.lines.length - conflicts, 'change')}
            {conflicts > 0 ? (
              <>
                {' '}and <b>{plural(conflicts, 'conflict')}</b>
              </>
            ) : null}
          </span>
        ) : null}
      </header>
      <div className="simulation-results-body">
        {running ? (
          <div className="simulation-running">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} />
            ))}
          </div>
        ) : failed ? (
          <div className="simulation-failed">
            <span>
              <Icon name="alert" size={27} />
            </span>
            <b>{failed}</b>
            <Button onClick={onRetry}>Try again</Button>
          </div>
        ) : result ? (
          <div className="simulation-result-list">
            <p className="simulation-headline">{result.headline}</p>
            {result.lines.length === 0 ? <p className="simulation-headline">Nothing else would change.</p> : null}
            {result.lines.map((line, index) => (
              <div className={`simulation-result-row ${line.kind === 'alert' ? 'is-conflict' : ''}`} key={`${line.title}-${index}`}>
                <span>
                  <Icon name={LINE_ICONS[line.kind]} />
                </span>
                <div>
                  <b>{line.title}</b>
                  {line.detail ? <small>{line.detail}</small> : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="simulation-before">
            <span>
              <Icon name="flask" size={28} />
            </span>
            <b>Run a scenario to see what would change.</b>
            <p>Results are previews only. Nothing is applied.</p>
          </div>
        )}
      </div>
      {result && !running ? (
        <footer>
          <Button onClick={onDiscard}>Discard</Button>
        </footer>
      ) : null}
    </section>
  )
}

export function WhatIfPanel({ options }: { readonly options: SimulationOptions }) {
  const [scenario, setScenario] = useState<Scenario>('flight_delay')
  const [flightId, setFlightId] = useState(options.flights[0]?.id ?? '')
  const [delay, setDelay] = useState('90')
  const [driverId, setDriverId] = useState(options.drivers[0]?.id ?? '')
  const [from, setFrom] = useState('')
  const [roomId, setRoomId] = useState(options.rooms[0]?.id ?? '')
  const [result, setResult] = useState<WhatIfResult | null>(null)
  const [running, setRunning] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const reset = () => {
    setResult(null)
    setFailed(null)
  }
  const flight = options.flights.find((item) => item.id === flightId)
  // The operational day: the chosen (or first upcoming) flight's local date.
  const day = flight?.scheduled_arrival_at ? dateKey(flight.scheduled_arrival_at, options.timezone) : null

  const run = async () => {
    setRunning(true)
    setFailed(null)
    try {
      const bodies: Record<Scenario, () => object> = {
        flight_delay: () => ({ kind: scenario, flight_id: flightId, minutes: Number(delay) || 0 }),
        driver_unavailable: () => ({ kind: scenario, driver_id: driverId, ...(from && day ? { from: zonedDateTime(day, from, options.timezone) } : {}) }),
        room_out_of_service: () => ({ kind: scenario, room_id: roomId }),
      }
      const body = bodies[scenario]()
      setResult(await apiSend<WhatIfResult>('/api/simulation/what-if', 'POST', body))
    } catch (caught: unknown) {
      setFailed(errorMessage(caught))
    } finally {
      setRunning(false)
    }
  }
  const ready = Boolean({ flight_delay: flightId, driver_unavailable: driverId, room_out_of_service: roomId }[scenario])

  return (
    <div className="simulation-layout">
      <section className="simulation-scenario-card">
        <h2>What if…</h2>
        <label className="simulation-field">
          <span>Scenario type</span>
          <select
            value={scenario}
            onChange={(event) => {
              setScenario(event.target.value as Scenario)
              reset()
            }}
          >
            <option value="flight_delay">Flight delay</option>
            <option value="driver_unavailable">Driver unavailable</option>
            <option value="room_out_of_service">Room out of service</option>
          </select>
        </label>
        {scenario === 'flight_delay' ? (
          <>
            <label className="simulation-field">
              <span>Flight</span>
              <select
                value={flightId}
                onChange={(event) => {
                  setFlightId(event.target.value)
                  reset()
                }}
              >
                {options.flights.length === 0 ? <option value="">No upcoming flights</option> : null}
                {options.flights.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.flight_number}
                    {item.scheduled_arrival_at ? ` · ${formatTime(item.scheduled_arrival_at, options.timezone)}` : ''} · {item.delegations.join(', ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="simulation-field">
              <span>Delay (minutes; negative for early)</span>
              <input
                type="number"
                min={-720}
                max={720}
                value={delay}
                onChange={(event) => {
                  setDelay(event.target.value)
                  reset()
                }}
              />
            </label>
            <div className="simulation-chips" role="group" aria-label="Common delays">
              {DELAY_CHIPS.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={Number(delay) === item ? 'is-selected' : ''}
                  aria-pressed={Number(delay) === item}
                  onClick={() => {
                    setDelay(String(item))
                    reset()
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </>
        ) : scenario === 'room_out_of_service' ? (
          <label className="simulation-field">
            <span>Room</span>
            <select
              value={roomId}
              onChange={(event) => {
                setRoomId(event.target.value)
                reset()
              }}
            >
              {options.rooms.length === 0 ? <option value="">No rooms with guests yet</option> : null}
              {options.rooms.map((item) => (
                <option key={item.id} value={item.id}>
                  Room {item.number} · {item.guests.join(', ')}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="simulation-field">
              <span>Driver</span>
              <select
                value={driverId}
                onChange={(event) => {
                  setDriverId(event.target.value)
                  reset()
                }}
              >
                {options.drivers.length === 0 ? <option value="">No active drivers</option> : null}
                {options.drivers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.full_name}
                    {item.vehicle_label ? ` · ${item.vehicle_label}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="simulation-field">
              <span>Unavailable from{day ? ` (${formatIsoDate(day)})` : ''}</span>
              <input
                type="time"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value)
                  reset()
                }}
              />
              <small className="simulation-hint">Leave empty for the whole day.</small>
            </label>
          </>
        )}
        <button type="button" className="simulation-run" disabled={!ready || running} onClick={() => void run()}>
          <Icon name="play" />
          {running ? 'Running…' : 'Run simulation'}
        </button>
      </section>
      <Results result={result} running={running} failed={failed} onRetry={() => void run()} onDiscard={reset} />
    </div>
  )
}
