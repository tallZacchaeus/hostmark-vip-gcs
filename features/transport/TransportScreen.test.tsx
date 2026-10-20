import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '@/tests/support/api-mock'
import { renderWithApp } from '@/tests/support/render'
import type { BoardTrip, TransportBoard } from './model'
import { TransportScreen } from './TransportScreen'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/transport' }))

const trip = (overrides: Partial<BoardTrip>): BoardTrip => ({
  pickup_id: 'pk-1',
  assignment_id: 'as-1',
  proposal_id: null,
  label: 'Okafor +3',
  principal_guest_id: 'g-1',
  pickup_at: '2026-10-28T13:55:00.000Z',
  window_start: '2026-10-28T12:55:00.000Z',
  window_end: '2026-10-28T14:55:00.000Z',
  kind: 'airport',
  state: 'planned',
  pickup_status: 'assigned',
  pickup_location: 'LOS arrivals',
  passenger_count: 4,
  flight_number: 'EK783',
  acknowledged: false,
  ...overrides,
})

const BOARD: TransportBoard = {
  day: '2026-10-28',
  days: ['2026-10-28'],
  timezone: 'Africa/Lagos',
  range: { start: '2026-10-28T07:00:00.000Z', end: '2026-10-28T19:00:00.000Z' },
  pickup_count: 2,
  drivers: [
    { id: 'dr-1', full_name: 'Emeka Oladipo', vehicle_label: 'Coaster bus', vehicle_capacity: 18, state: 'available', shifts: [{ starts_at: '2026-10-28T06:00:00.000Z', ends_at: '2026-10-28T18:00:00.000Z' }], trips: [trip({})] },
    { id: 'dr-2', full_name: 'Sule Abdullahi', vehicle_label: 'Prado SUV', vehicle_capacity: 6, state: 'available', shifts: [{ starts_at: '2026-10-28T06:00:00.000Z', ends_at: '2026-10-28T18:00:00.000Z' }], trips: [trip({ assignment_id: null, proposal_id: 'pr-1', state: 'suggested' })] },
    { id: 'dr-3', full_name: 'Musa Ibrahim', vehicle_label: 'Hiace', vehicle_capacity: 14, state: 'off_shift', shifts: [], trips: [] },
  ],
  needs_driver: [trip({ pickup_id: 'pk-2', assignment_id: null, label: 'Eze +1', state: 'unassigned', pickup_status: 'pending_assignment', kind: 'location' })],
  decisions: [
    {
      proposal_id: 'pr-1',
      kind: 'driver_reassignment',
      title: 'Reassign the 14:55 pickup for Okafor delegation',
      summary: 'EK783 now lands 14:25 (45 min late). Emeka Oladipo can no longer make it; Sule Abdullahi can.',
      also_changes: 'Pickup moves from 14:10 to 14:55',
      alternatives: ['Kunle Balogun'],
      pickup_id: 'pk-1',
      created_at: '2026-10-28T10:15:00.000Z',
    },
  ],
}

describe('TransportScreen', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows decisions, the board and who still needs a driver', async () => {
    mockApi([{ path: '/api/transport', body: BOARD }])
    renderWithApp(<TransportScreen />)

    const card = await screen.findByRole('article', { name: /Reassign the 14:55 pickup/ })
    expect(card).toHaveTextContent('Also changes: Pickup moves from 14:10 to 14:55')
    expect(card).toHaveTextContent('Kunle Balogun')
    expect(screen.getByText('2 pickups · 1 needs a driver')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Suggest a driver for Eze \+1/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Musa Ibrahim/ })).toHaveTextContent('Off shift')
  })

  it('approves a decision and explains one the system could no longer carry out', async () => {
    const fetchMock = mockApi([
      { path: '/api/transport', body: BOARD },
      { path: '/api/proposals/pr-1/approve', method: 'POST', body: { id: 'pr-1', status: 'failed', error: 'driver_busy' } },
    ])
    renderWithApp(<TransportScreen />)
    await screen.findByRole('article', { name: /Reassign/ })

    await userEvent.setup().click(screen.getByRole('button', { name: 'Approve' }))

    expect(await screen.findByText(/Not carried out: That driver is now busy/)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes('/api/proposals/pr-1/approve') && init?.method === 'POST')).toBe(true)
  })

  it('asks the matcher for a driver', async () => {
    const fetchMock = mockApi([
      { path: '/api/transport', body: BOARD },
      { path: '/api/pickups/pk-2/suggest', method: 'POST', body: { proposal_id: 'pr-9' } },
    ])
    renderWithApp(<TransportScreen />)

    await userEvent.setup().click(await screen.findByRole('button', { name: /Suggest a driver for Eze/ }))

    expect(await screen.findByText('Suggestion ready for Eze +1.')).toBeInTheDocument()
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/pickups/pk-2/suggest'))).toBe(true))
  })

  it("opens a driver's day", async () => {
    mockApi([{ path: '/api/transport', body: BOARD }])
    renderWithApp(<TransportScreen />)

    await userEvent.setup().click(await screen.findByRole('button', { name: /Emeka Oladipo/ }))

    const drawer = screen.getByRole('dialog', { name: 'Emeka Oladipo' })
    expect(drawer).toHaveTextContent('On shift 07:00–19:00.')
    expect(drawer).toHaveTextContent('Okafor +3')
    expect(drawer).toHaveTextContent('not yet confirmed by the driver')
  })
})
