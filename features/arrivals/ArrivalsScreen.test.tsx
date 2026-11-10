import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '@/tests/support/api-mock'
import { renderWithApp, sessionFor } from '@/tests/support/render'
import { ArrivalsScreen } from './ArrivalsScreen'
import type { ArrivalBoardRow, ArrivalsBoard } from './model'

const navigation = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: navigation.push }), usePathname: () => '/arrivals' }))

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

  it('shows parties without flight details and sends the pickup cells to Transport', async () => {
    const pickupParty = row({
      arrival_id: 'a-4',
      delegation_id: 'd-4',
      delegation_name: 'Eze party',
      principal_guest_id: null,
      principal_name: null,
      category: null,
      party_size: 1,
      mode: 'pickup',
      pickup_address: 'Victoria Island',
      arrival_at: null,
      status: 'due',
      flight: null,
      pickup: { id: 'p-4', status: 'pending_assignment', pickup_at: '2026-10-28T15:00:00.000Z', previous_pickup_at: null, pickup_location: 'Victoria Island' },
      drivers: [],
      suggestion: null,
    })
    const flightToFollow = row({ arrival_id: 'a-5', delegation_id: 'd-5', principal_name: 'Grace Okon', flight: null, pickup: null, drivers: [], suggestion: null, status: 'due' })
    mockApi([{ path: '/api/arrivals', body: { ...BOARD, days: ['2026-10-28'], updated_at: null, rows: [pickupParty, flightToFollow] } }])
    renderWithApp(<ArrivalsScreen />, sessionFor('coordinator', 'live'))

    const eze = await screen.findByRole('link', { name: /Eze party/ })
    expect(eze).toHaveAttribute('href', '/guests')
    expect(eze).toHaveTextContent('No category')
    expect(eze).toHaveTextContent('Pickup requested')
    expect(eze).toHaveTextContent('Victoria Island')
    expect(eze).toHaveTextContent('Needs a driver')
    expect(eze).not.toHaveTextContent('+')
    expect(screen.getByRole('link', { name: /Grace Okon/ })).toHaveTextContent('Flight to follow')
    expect(screen.getByText('Live flight data')).toBeInTheDocument()
    expect(screen.queryByLabelText('Day')).not.toBeInTheDocument()

    await userEvent.setup().click(within(eze).getAllByText('Needs a driver')[0] as HTMLElement)
    expect(navigation.push).toHaveBeenCalledWith('/transport')
  })

  describe('on the day itself', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('marks now, limits the time window and recovers from a search with no results', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-28T12:00:00Z'))
      const evening = row({ arrival_id: 'a-6', delegation_id: 'd-6', principal_name: 'Late Guest', arrival_at: '2026-10-28T18:30:00.000Z', status: 'due', suggestion: null })
      mockApi([{ path: '/api/arrivals', body: { ...BOARD, rows: [...BOARD.rows, evening] } }])
      const user = userEvent.setup()
      renderWithApp(<ArrivalsScreen />)

      await screen.findByRole('link', { name: /Okafor/ })
      expect(screen.getByText('Now · 13:00')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'All day' })).toHaveAttribute('aria-pressed', 'true')

      await user.click(screen.getByRole('button', { name: 'Next 2 h' }))
      expect(screen.getByRole('button', { name: 'Next 2 h' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.queryByRole('link', { name: /Late Guest/ })).not.toBeInTheDocument()

      await user.type(screen.getByLabelText('Search guest or flight'), 'nobody')
      expect(screen.getByText('No arrivals match.')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Show all' }))
      expect(screen.getByRole('link', { name: /Late Guest/ })).toBeInTheDocument()
      expect(screen.getByLabelText('Search guest or flight')).toHaveValue('')
    })
  })
})
