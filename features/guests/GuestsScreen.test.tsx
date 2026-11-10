import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, type MockRoute } from '@/tests/support/api-mock'
import { requestsTo } from '@/tests/support/fetch-calls'
import { renderWithApp } from '@/tests/support/render'
import { GuestsScreen } from './GuestsScreen'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/guests' }))

const ROW = {
  delegation_id: 'd-1',
  delegation_name: 'Dr Ngozi Eze',
  principal_guest_id: 'g-1',
  title: 'Dr',
  full_name: 'Ngozi Eze',
  category_id: 'c-1',
  category_name: 'Dignitary',
  companions: 1,
  arrival_mode: 'pickup',
  arrival_at: '2026-10-28T15:30:00Z',
  arrival_status: 'expected',
  flight_number: null,
  flight_phase: null,
  pickup_address: 'Victoria Island, Lagos',
  pickup_status: 'pending_assignment',
  pickup_at: '2026-10-28T15:30:00Z',
  open_issues: 1,
  reference_code: 'VIP-AB12',
  room_number: '204',
  rooms_placed: 1,
  room_checked_in: false,
  room_suggested: false,
}
const LIST = { rows: [ROW], tabs: { all: 1, today: 1, attention: 1, arrived: 0 }, totals: { delegations: 1, guests: 2 } }

describe('GuestsScreen', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows one row per delegation with arrival, transport and open issues', async () => {
    mockApi([
      { path: '/api/guests', body: LIST, meta: { total: 1, page: 1, limit: 50 } },
      { path: '/api/admin/vip-categories', body: [{ id: 'c-1', name: 'Dignitary', rank: 3 }] },
    ])
    renderWithApp(<GuestsScreen />)

    const row = await screen.findByRole('link', { name: /Dr Ngozi Eze/ })
    expect(row).toHaveAttribute('href', '/guests/g-1')
    expect(row).toHaveTextContent('+1')
    expect(row).toHaveTextContent('Needs a driver')
    expect(row).toHaveTextContent('1 issue')
    expect(row).toHaveTextContent('Pickup requested')
    expect(row).toHaveTextContent('Room 204 · 1 of 2 placed')
    expect(screen.getByText('1 delegation · 2 guests')).toBeInTheDocument()
  })

  it('searches after typing pauses', async () => {
    const fetchMock = mockApi([
      { path: '/api/guests', body: LIST, meta: { total: 1, page: 1, limit: 50 } },
      { path: '/api/admin/vip-categories', body: [] },
    ])
    renderWithApp(<GuestsScreen />)
    await screen.findByRole('link', { name: /Dr Ngozi Eze/ })

    await userEvent.setup().type(screen.getByLabelText('Search by name, flight or reference'), 'eze')
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('search=eze'))).toBe(true))
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('search=e&'))).toBe(false)
  })

  it('offers to add the first guest when there are none', async () => {
    mockApi([
      { path: '/api/guests', body: { rows: [], tabs: { all: 0, today: 0, attention: 0, arrived: 0 }, totals: { delegations: 0, guests: 0 } }, meta: { total: 0, page: 1, limit: 50 } },
      { path: '/api/admin/vip-categories', body: [] },
    ])
    renderWithApp(<GuestsScreen />)
    expect(await screen.findByText('No guests yet.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add guest' })).toHaveLength(2)
  })

  const variety = [
    { ...ROW, delegation_id: 'd-2', principal_guest_id: 'g-2', title: null, full_name: 'Musa Danjuma', category_name: null, companions: 0, arrival_mode: 'own_transport', arrival_at: null, pickup_status: null, open_issues: 0, room_number: '301', rooms_placed: 1, room_checked_in: true },
    { ...ROW, delegation_id: 'd-3', principal_guest_id: 'g-3', title: 'Hon.', full_name: 'Ibrahim Bello', companions: 0, arrival_mode: 'flying', flight_number: 'EK783', pickup_status: null, open_issues: 0, room_number: null, rooms_placed: 0, room_suggested: true },
    { ...ROW, delegation_id: 'd-4', principal_guest_id: 'g-4', title: null, full_name: 'Grace Okon', companions: 0, arrival_mode: 'pickup', pickup_status: null, open_issues: 2, room_number: '412', rooms_placed: 1, room_suggested: false },
    { ...ROW, delegation_id: 'd-5', principal_guest_id: 'g-5', title: null, full_name: 'Chidi Obi', companions: 0, arrival_mode: null, pickup_status: null, open_issues: 0, room_number: null, rooms_placed: 0, room_suggested: false },
  ]
  const listRoute = (rows: unknown[], total = rows.length): MockRoute => ({
    path: '/api/guests',
    body: { rows, tabs: { all: total, today: 1, attention: 1, arrived: 1 }, totals: { delegations: total, guests: total } },
    meta: { total, page: 1, limit: 50 },
  })
  const categoriesRoute: MockRoute = { path: '/api/admin/vip-categories', body: [{ id: 'c-1', name: 'Dignitary', rank: 3 }] }
  const rowFor = (name: RegExp) => within(screen.getByRole('link', { name }))

  it('reads transport and room for every way a party arrives', async () => {
    mockApi([listRoute(variety), categoriesRoute])
    renderWithApp(<GuestsScreen />)
    await screen.findByRole('link', { name: /Musa Danjuma/ })

    expect(rowFor(/Musa Danjuma/).getByText('No category')).toBeInTheDocument()
    expect(rowFor(/Musa Danjuma/).getByText('Time to follow')).toBeInTheDocument()
    expect(rowFor(/Musa Danjuma/).getByText('Own transport')).toBeInTheDocument()
    expect(rowFor(/Musa Danjuma/).getByText('Not needed')).toBeInTheDocument()
    expect(rowFor(/Musa Danjuma/).getByText('Room 301 · in house')).toBeInTheDocument()
    expect(rowFor(/Musa Danjuma/).getByLabelText('No open issues')).toBeInTheDocument()

    expect(rowFor(/Ibrahim Bello/).getByText('EK783')).toBeInTheDocument()
    expect(rowFor(/Ibrahim Bello/).getByText('Waits for landing time')).toBeInTheDocument()
    expect(rowFor(/Ibrahim Bello/).getByText('Suggested')).toBeInTheDocument()

    expect(rowFor(/Grace Okon/).getByText('Not planned')).toBeInTheDocument()
    expect(rowFor(/Grace Okon/).getByText('Room 412')).toBeInTheDocument()
    expect(rowFor(/Grace Okon/).getByText('2 issues')).toBeInTheDocument()

    expect(rowFor(/Chidi Obi/).getAllByText('Not planned')).toHaveLength(2)
  })

  it('filters by tab and category, and clears filters when nothing matches', async () => {
    const fetchMock = mockApi([listRoute([]), categoriesRoute])
    const user = userEvent.setup()
    renderWithApp(<GuestsScreen />)
    await screen.findByText('No guests yet.')

    await user.click(screen.getByRole('tab', { name: /Needs attention/ }))
    expect(await screen.findByText('No guests match.')).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'VIP category' }), 'c-1')
    await waitFor(() => expect(requestsTo(fetchMock, 'GET', '/api/guests').at(-1)?.url).toBe('/api/guests?tab=attention&category_id=c-1&page=1&limit=50'))

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByRole('tab', { name: /All/ })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('No guests yet.')).toBeInTheDocument()
  })

  it('pages through long guest lists', async () => {
    const fetchMock = mockApi([listRoute([ROW], 120), categoriesRoute])
    const user = userEvent.setup()
    renderWithApp(<GuestsScreen />)
    await screen.findByText('Showing 1 of 120')
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(requestsTo(fetchMock, 'GET', '/api/guests').at(-1)?.url).toContain('page=2'))
    await user.click(screen.getByRole('button', { name: 'Previous page' }))
    await waitFor(() => expect(requestsTo(fetchMock, 'GET', '/api/guests').at(-1)?.url).toContain('page=1'))
  })

  it('shows a load failure with Retry', async () => {
    mockApi([{ path: '/api/guests', status: 500, body: { code: 'internal_error', message: 'boom' } }, categoriesRoute])
    renderWithApp(<GuestsScreen />)
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load guests.")
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('opens and closes the Add guest drawer', async () => {
    mockApi([listRoute([ROW]), categoriesRoute])
    const user = userEvent.setup()
    renderWithApp(<GuestsScreen />)
    await screen.findByRole('link', { name: /Dr Ngozi Eze/ })

    await user.click(screen.getByRole('button', { name: 'Add guest' }))
    expect(screen.getByRole('dialog', { name: 'Add guest' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close drawer' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
