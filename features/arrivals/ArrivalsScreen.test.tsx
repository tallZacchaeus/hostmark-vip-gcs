import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '@/tests/support/api-mock'
import { renderWithApp } from '@/tests/support/render'
import { ArrivalsScreen } from './ArrivalsScreen'
import type { ArrivalBoardRow, ArrivalsBoard } from './model'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/arrivals' }))

const row = (overrides: Partial<ArrivalBoardRow>): ArrivalBoardRow => ({
  arrival_id: 'a-1',
  delegation_id: 'd-1',
  delegation_name: 'Okafor delegation',
  principal_guest_id: 'g-1',
  principal_name: 'Bishop Augustine Okafor',
  category: 'Cat. 1',
  party_size: 4,
  mode: 'flying',
  pickup_address: null,
  arrival_at: '2026-10-28T13:25:00.000Z',
  attention: null,
  status: 'delayed',
  flight: { id: 'f-1', flight_number: 'EK783', phase: 'in_air', delay_minutes: 45, scheduled_arrival_at: '2026-10-28T12:40:00.000Z', manual_arrival_at: null },
  pickup: { id: 'p-1', status: 'assigned', pickup_at: '2026-10-28T13:55:00.000Z', previous_pickup_at: '2026-10-28T13:10:00.000Z', pickup_location: 'LOS arrivals' },
  drivers: ['Emeka Oladipo'],
  suggestion: { proposal_id: 'pr-1', kind: 'driver_reassignment', driver_names: 'Sule Abdullahi' },
  ...overrides,
})

const BOARD: ArrivalsBoard = {
  day: '2026-10-28',
  days: ['2026-10-28', '2026-10-29'],
  timezone: 'Africa/Lagos',
  updated_at: '2026-10-28T10:18:00.000Z',
  rows: [
    row({}),
    row({
      arrival_id: 'a-2',
      delegation_id: 'd-2',
      principal_guest_id: 'g-2',
      principal_name: 'Pastor Daniel Kwarteng',
      party_size: 3,
      arrival_at: '2026-10-28T11:50:00.000Z',
      status: 'cancelled',
      attention: 'Flight AW312 cancelled',
      flight: { id: 'f-2', flight_number: 'AW312', phase: 'cancelled', delay_minutes: null, scheduled_arrival_at: '2026-10-28T11:50:00.000Z', manual_arrival_at: null },
      pickup: { id: 'p-2', status: 'pending_assignment', pickup_at: '2026-10-28T12:20:00.000Z', previous_pickup_at: null, pickup_location: 'LOS arrivals' },
      drivers: [],
      suggestion: { proposal_id: 'pr-2', kind: 'release_pickup', driver_names: null },
    }),
    row({ arrival_id: 'a-3', delegation_id: 'd-3', principal_guest_id: 'g-3', principal_name: 'Hon. Ibrahim Bello', mode: 'own_transport', flight: null, pickup: null, drivers: [], suggestion: null, status: 'due', arrival_at: '2026-10-28T14:00:00.000Z' }),
  ],
}

describe('ArrivalsScreen', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows each arrival with flight status, the changed time, pickup, driver and suggestion', async () => {
    mockApi([{ path: '/api/arrivals', body: BOARD }])
    renderWithApp(<ArrivalsScreen />)

    const okafor = await screen.findByRole('link', { name: /Bishop Augustine Okafor/ })
    expect(okafor).toHaveAttribute('href', '/guests/g-1')
    expect(okafor).toHaveTextContent('14:25')
    expect(okafor).toHaveTextContent('13:40')
    expect(okafor).toHaveTextContent('Changed')
    expect(okafor).toHaveTextContent('Delayed +45 min')
    expect(okafor).toHaveTextContent('Driver assigned')
    expect(okafor).toHaveTextContent('Emeka Oladipo')
    expect(okafor).toHaveTextContent('Sule Abdullahi')
    const cancelled = screen.getByRole('link', { name: /Pastor Daniel Kwarteng/ })
    expect(cancelled).toHaveClass('is-attention')
    expect(cancelled).toHaveTextContent('Release suggested')
    expect(screen.getByRole('link', { name: /Hon. Ibrahim Bello/ })).toHaveTextContent('Pickup not needed')
    expect(screen.getByText(/3 delegations · 11 guests/)).toBeInTheDocument()
    expect(screen.getByText(/Simulated flight data · updated 11:18/)).toBeInTheDocument()
  })

  it('filters by status and search', async () => {
    mockApi([{ path: '/api/arrivals', body: BOARD }])
    renderWithApp(<ArrivalsScreen />)
    await screen.findByRole('link', { name: /Bishop Augustine Okafor/ })
    const user = userEvent.setup()

    await user.selectOptions(screen.getByLabelText('Status'), 'cancelled')
    expect(screen.queryByRole('link', { name: /Okafor/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Kwarteng/ })).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Status'), 'all')
    await user.type(screen.getByLabelText('Search guest or flight'), 'ek783')
    const card = screen.getByRole('link', { name: /Okafor/ }).closest('section') as HTMLElement
    expect(within(card).getAllByRole('link')).toHaveLength(1)
  })

  it('asks for another day', async () => {
    const fetchMock = mockApi([{ path: '/api/arrivals', body: BOARD }])
    renderWithApp(<ArrivalsScreen />)
    await screen.findByRole('link', { name: /Okafor/ })

    await userEvent.setup().selectOptions(screen.getByLabelText('Day'), '2026-10-29')
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('day=2026-10-29'))).toBe(true)
  })

  it('shows an empty day and a load failure', async () => {
    mockApi([{ path: '/api/arrivals', body: { ...BOARD, rows: [] } }])
    const { unmount } = renderWithApp(<ArrivalsScreen />)
    expect(await screen.findByText('No arrivals on this day.')).toBeInTheDocument()
    unmount()

    mockApi([{ path: '/api/arrivals', status: 500, body: { code: 'internal_error', message: 'Something went wrong' } }])
    renderWithApp(<ArrivalsScreen />)
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load arrivals.")
  })
})
