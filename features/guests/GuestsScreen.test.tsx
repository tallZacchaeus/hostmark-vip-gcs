import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '@/tests/support/api-mock'
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
})
