import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, sentBody } from '@/tests/support/api-mock'
import { renderWithApp } from '@/tests/support/render'
import { SimulationScreen } from './SimulationScreen'
import type { RunSummary, SimulationOptions } from './types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/simulation' }))

const OPTIONS: SimulationOptions = {
  flight_mode: 'simulated',
  timezone: 'Africa/Lagos',
  scenarios: [
    { key: 'single-delay', title: 'One flight 45 minutes late', description: 'The next flight is delayed.', steps: 1 },
    { key: 'cancellation', title: 'Cancelled flight', description: 'The next flight is cancelled.', steps: 1 },
  ],
  flights: [{ id: 'f-1', flight_number: 'EK783', scheduled_arrival_at: '2026-10-28T12:40:00.000Z', delegations: ['Okafor delegation'] }],
  drivers: [{ id: 'dr-1', full_name: 'Emeka Oladipo', vehicle_label: 'Coaster bus' }],
  rooms: [{ id: 'room-1', number: '301', guests: ['Augustine Okafor'] }],
}

const RUNNING: RunSummary = {
  id: 'run-1',
  scenario_key: 'single-delay',
  title: 'One flight 45 minutes late',
  status: 'running',
  speed: 60,
  steps_applied: 0,
  steps_total: 1,
  flight_numbers: ['EK783'],
  room_numbers: [],
  delegations: [],
  virtual_start: '2026-10-28T10:40:00.000Z',
  real_start: new Date().toISOString(),
  stopped_at: null,
}

const RESULT = {
  headline: 'EK783 90 min late: 1 pickup change, 0 decisions',
  decisions: 0,
  lines: [
    { kind: 'time', title: 'Okafor delegation pickup moves 14:10 → 15:40', detail: null },
    { kind: 'alert', title: 'No driver is free for Okafor delegation at 15:40', detail: null },
  ],
}

describe('SimulationScreen', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('previews a flight delay without changing anything', async () => {
    const fetchMock = mockApi([
      { path: '/api/simulation/options', body: OPTIONS },
      { path: '/api/simulation/runs', body: { runs: [] } },
      { path: '/api/simulation/what-if', method: 'POST', body: RESULT },
    ])
    renderWithApp(<SimulationScreen />)
    expect(await screen.findByText('Run a scenario to see what would change.')).toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Run simulation' }))

    expect(await screen.findByText(RESULT.headline)).toBeInTheDocument()
    expect(screen.getByText('No driver is free for Okafor delegation at 15:40').closest('.simulation-result-row')).toHaveClass('is-conflict')
    expect(screen.getByText(/1 change/)).toHaveTextContent('1 change and 1 conflict')
    const call = fetchMock.mock.calls.findIndex(([url]) => String(url).includes('/what-if'))
    expect(sentBody(fetchMock, call)).toEqual({ kind: 'flight_delay', flight_id: 'f-1', minutes: 90 })
  })

  it('previews a driver dropping out from a time', async () => {
    const fetchMock = mockApi([
      { path: '/api/simulation/options', body: OPTIONS },
      { path: '/api/simulation/runs', body: { runs: [] } },
      { path: '/api/simulation/what-if', method: 'POST', body: { headline: 'Emeka Oladipo unavailable: no trips affected', decisions: 0, lines: [] } },
    ])
    renderWithApp(<SimulationScreen />)
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('Scenario type'), 'driver_unavailable')
    await user.type(screen.getByLabelText(/Unavailable from/), '14:00')

    await user.click(screen.getByRole('button', { name: 'Run simulation' }))

    expect(await screen.findByText('Nothing else would change.')).toBeInTheDocument()
    const call = fetchMock.mock.calls.findIndex(([url]) => String(url).includes('/what-if'))
    expect(sentBody(fetchMock, call)).toEqual({ kind: 'driver_unavailable', driver_id: 'dr-1', from: '2026-10-28T13:00:00.000Z' })
  })

  it('previews a room going out of service', async () => {
    const fetchMock = mockApi([
      { path: '/api/simulation/options', body: OPTIONS },
      { path: '/api/simulation/runs', body: { runs: [] } },
      {
        path: '/api/simulation/what-if',
        method: 'POST',
        body: { headline: 'Room 301 out of service: 1 guest affected, 1 decision', decisions: 1, lines: [{ kind: 'proposal', title: 'Move Augustine Okafor from room 301 to 205', detail: null }] },
      },
    ])
    renderWithApp(<SimulationScreen />)
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('Scenario type'), 'room_out_of_service')
    expect(screen.getByLabelText('Room')).toHaveDisplayValue('Room 301 · Augustine Okafor')
    expect(screen.queryByRole('option', { name: /with room allocation/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Run simulation' }))

    expect(await screen.findByText('Move Augustine Okafor from room 301 to 205')).toBeInTheDocument()
    const call = fetchMock.mock.calls.findIndex(([url]) => String(url).includes('/what-if'))
    expect(sentBody(fetchMock, call)).toEqual({ kind: 'room_out_of_service', room_id: 'room-1' })
  })

  it('stops a running scripted scenario and blocks a second one', async () => {
    const fetchMock = mockApi([
      { path: '/api/simulation/options', body: OPTIONS },
      { path: '/api/simulation/runs/run-1/stop', method: 'POST', body: { ...RUNNING, status: 'stopped' } },
      { path: '/api/simulation/runs', body: { runs: [RUNNING] } },
    ])
    renderWithApp(<SimulationScreen />)

    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Stop' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes('/runs/run-1/stop') && init?.method === 'POST')).toBe(true))
    expect(screen.getByRole('button', { name: /Start/ })).toBeDisabled()
  })

  it('starts a scripted scenario at the chosen speed', async () => {
    const fetchMock = mockApi([
      { path: '/api/simulation/options', body: OPTIONS },
      { path: '/api/simulation/runs', method: 'POST', body: RUNNING },
      { path: '/api/simulation/runs', body: { runs: [] } },
    ])
    renderWithApp(<SimulationScreen />)
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('Scenario'), 'cancellation')
    await user.selectOptions(screen.getByLabelText('Speed'), '600')

    await user.click(screen.getByRole('button', { name: /Start/ }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.findIndex(([url, init]) => String(url).endsWith('/api/simulation/runs') && init?.method === 'POST')
      expect(sentBody(fetchMock, call)).toEqual({ scenario_key: 'cancellation', speed: 600 })
    })
  })

  it('lists room scenario runs with the room or delegation they act on', async () => {
    const finished = { ...RUNNING, status: 'completed', steps_applied: 1, flight_numbers: [], stopped_at: '2026-10-28T10:41:00.000Z' }
    mockApi([
      { path: '/api/simulation/options', body: { ...OPTIONS, scenarios: [...OPTIONS.scenarios, { key: 'room-out-of-service', title: 'Room out of service', description: 'A room is taken out of service.', steps: 1 }] } },
      {
        path: '/api/simulation/runs',
        body: {
          runs: [
            { ...finished, id: 'run-2', scenario_key: 'room-out-of-service', title: 'Room out of service', room_numbers: ['301'] },
            { ...finished, id: 'run-3', scenario_key: 'extra-guests', title: 'Extra guests', delegations: ['Okafor delegation'] },
          ],
        },
      },
    ])
    renderWithApp(<SimulationScreen />)

    expect(await screen.findByText(/Room 301 · step 1 of 1/)).toBeInTheDocument()
    expect(screen.getByText(/Okafor delegation · step 1 of 1/)).toBeInTheDocument()
    expect(within(screen.getByLabelText('Scenario')).getByRole('option', { name: 'Room out of service' })).toBeInTheDocument()
  })

  it('explains that scripted runs need simulated mode', async () => {
    mockApi([
      { path: '/api/simulation/options', body: { ...OPTIONS, flight_mode: 'live' } },
      { path: '/api/simulation/runs', body: { runs: [] } },
    ])
    renderWithApp(<SimulationScreen />)

    expect(await screen.findByText(/Scripted runs need simulated flight data/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Start/ })).toBeDisabled()
  })
})
