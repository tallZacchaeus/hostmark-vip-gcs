import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, type MockRoute } from '@/tests/support/api-mock'
import { requestsTo } from '@/tests/support/fetch-calls'
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

  const boardRoute = (board: TransportBoard): MockRoute => ({ path: '/api/transport', body: board })

  it('switches between event days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T10:30:00Z'))
    try {
      const fetchMock = mockApi([boardRoute({ ...BOARD, days: ['2026-10-28', '2026-10-29'] })])
      renderWithApp(<TransportScreen />)

      const tomorrow = await screen.findByRole('tab', { name: 'Thu 29 Oct' })
      expect(screen.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true')
      await userEvent.setup().click(tomorrow)
      await waitFor(() => expect(requestsTo(fetchMock, 'GET', '/api/transport').at(-1)?.url).toBe('/api/transport?day=2026-10-29'))
    } finally {
      vi.useRealTimers()
    }
  })

  it('says when there are no pickups or drivers yet', async () => {
    mockApi([boardRoute({ ...BOARD, pickup_count: 0, drivers: [], needs_driver: [], decisions: [] })])
    renderWithApp(<TransportScreen />)
    expect(await screen.findByText('No pickups or drivers yet.')).toBeInTheDocument()
    expect(screen.getByText('0 pickups · all assigned')).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('counts several pickups that need a driver', async () => {
    const second = trip({ pickup_id: 'pk-3', assignment_id: null, label: 'Bello', state: 'unassigned', pickup_status: 'pending_assignment', proposal_id: 'pr-5' })
    mockApi([boardRoute({ ...BOARD, needs_driver: [...BOARD.needs_driver, second] })])
    renderWithApp(<TransportScreen />)
    expect(await screen.findByText('2 pickups · 2 need a driver')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bello: suggestion waiting' })).toBeDisabled()
  })

  it('shows a load failure with Retry', async () => {
    const fetchMock = mockApi([{ path: '/api/transport', status: 500, body: { code: 'internal_error', message: 'boom' } }])
    renderWithApp(<TransportScreen />)
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the driver schedule.")
    const loads = requestsTo(fetchMock, 'GET', '/api/transport').length
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(requestsTo(fetchMock, 'GET', '/api/transport').length).toBeGreaterThan(loads))
  })

  it('rejects a decision, and reports one that fails to send', async () => {
    mockApi([boardRoute(BOARD), { path: '/api/proposals/pr-1/reject', method: 'POST', body: { id: 'pr-1', status: 'rejected' } }])
    const user = userEvent.setup()
    renderWithApp(<TransportScreen />)
    const card = await screen.findByRole('article', { name: /Reassign/ })

    await user.click(within(card).getByRole('button', { name: /Reject|Keep/ }))
    expect(await screen.findByText('Rejected: Reassign the 14:55 pickup for Okafor delegation')).toBeInTheDocument()

    mockApi([boardRoute(BOARD), { path: '/api/proposals/pr-1/approve', method: 'POST', status: 500, body: { code: 'internal_error', message: 'Decision could not be saved' } }])
    await user.click(within(card).getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText('Decision could not be saved')).toBeInTheDocument()
  })

  it.each([
    [{ reason: 'no_driver_free' }, 'No driver is free for Eze +1 at that time.'],
    [{ reason: 'already_covered' }, 'Eze +1 is already covered.'],
  ])('explains when the matcher has no suggestion (%o)', async (body, message) => {
    mockApi([boardRoute(BOARD), { path: '/api/pickups/pk-2/suggest', method: 'POST', body }])
    renderWithApp(<TransportScreen />)
    await userEvent.setup().click(await screen.findByRole('button', { name: /Suggest a driver for Eze/ }))
    expect(await screen.findByText(message)).toBeInTheDocument()
  })

  it('reports a failed request for a suggestion', async () => {
    mockApi([boardRoute(BOARD), { path: '/api/pickups/pk-2/suggest', method: 'POST', status: 409, body: { code: 'conflict', message: 'The pickup was cancelled' } }])
    renderWithApp(<TransportScreen />)
    await userEvent.setup().click(await screen.findByRole('button', { name: /Suggest a driver for Eze/ }))
    expect(await screen.findByText('The pickup was cancelled')).toBeInTheDocument()
  })

  it('shows a driver with no shift or trips, and an inactive driver, then closes the drawer', async () => {
    const inactive = { id: 'dr-4', full_name: 'Kunle Balogun', vehicle_label: null, vehicle_capacity: 4, state: 'inactive' as const, shifts: [], trips: [trip({ principal_guest_id: null, label: 'Staff run', flight_number: null })] }
    mockApi([boardRoute({ ...BOARD, drivers: [...BOARD.drivers, inactive] })])
    const user = userEvent.setup()
    renderWithApp(<TransportScreen />)

    await user.click(await screen.findByRole('button', { name: /Musa Ibrahim/ }))
    let drawer = screen.getByRole('dialog', { name: 'Musa Ibrahim' })
    expect(drawer).toHaveTextContent('No shift on this day.')
    expect(drawer).toHaveTextContent('No trips on this day.')
    await user.click(within(drawer).getByRole('button', { name: 'Close driver details' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Kunle Balogun/ }))
    drawer = screen.getByRole('dialog', { name: 'Kunle Balogun' })
    expect(drawer).toHaveTextContent('Inactive: not offered for new trips.')
    expect(within(drawer).queryByRole('link')).not.toBeInTheDocument()
    expect(drawer).toHaveTextContent('LOS arrivals')
  })
})
