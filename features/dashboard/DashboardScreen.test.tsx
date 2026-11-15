import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '@/tests/support/api-mock'
import { renderWithApp, sessionFor } from '@/tests/support/render'
import { DashboardScreen, type DashboardSummary } from './DashboardScreen'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/dashboard' }))

const summary = (overrides: Partial<DashboardSummary> = {}): DashboardSummary => ({
  rooms: { total: 10, ready: 6, needs_cleaning: 2, cleaning: 1, out_of_service: 1 },
  decisions_pending: 0,
  guests: { guests: 12, delegations: 4 },
  arrivals_today: { total: 3, flying: 2, by_road: 1 },
  pickups_today: { total: 2, needs_driver: 0 },
  intake_to_review: 0,
  programme_at_risk: [],
  ...overrides,
})

const routes = (body: DashboardSummary) => [
  { path: '/api/dashboard/summary', body },
  { path: '/api/decisions', body: [], meta: { total: 0, page: 1, limit: 50 } },
  { path: '/api/audit', body: [] },
]

describe('DashboardScreen', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows today’s at-risk programme items with who is late, in the event’s time zone, linked to the programme', async () => {
    mockApi(
      routes(
        summary({
          programme_at_risk: [
            {
              id: 'p-1',
              title: 'Welcome briefing',
              starts_at: '2026-10-28T16:00:00.000Z',
              location: 'Conference hall A',
              late: [{ guest_id: 'g-1', name: 'Bishop Augustine Okafor', expected_at: '2026-10-28T15:55:00.000Z' }],
            },
          ],
        }),
      ),
    )
    renderWithApp(<DashboardScreen />)

    const card = await screen.findByRole('region', { name: /Programme at risk/ })
    expect(within(card).getByText('1')).toBeInTheDocument()
    const link = within(card).getByRole('link', { name: /Welcome briefing/ })
    expect(link).toHaveAttribute('href', '/programme')
    expect(link).toHaveTextContent('At risk')
    expect(link).toHaveTextContent('17:00 · Conference hall A')
    expect(link).toHaveTextContent('Bishop Augustine Okafor expected 16:55')
    expect(within(card).getByRole('link', { name: 'View programme' })).toHaveAttribute('href', '/programme')
  })

  it('shows a calm state when nothing is at risk today', async () => {
    mockApi(routes(summary()))
    renderWithApp(<DashboardScreen />)

    const card = await screen.findByRole('region', { name: /Programme at risk/ })
    expect(await within(card).findByText('Nothing at risk today')).toBeInTheDocument()
    expect(within(card).queryByText('At risk')).not.toBeInTheDocument()
  })

  it('sends a Programme Manager with no event to the Events page instead of showing zeros', () => {
    mockApi(routes(summary()))
    renderWithApp(<DashboardScreen />, { ...sessionFor('programme_manager'), event: null })

    expect(screen.getByText(/not working in any event yet/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open Events/ })).toHaveAttribute('href', '/events')
    expect(screen.queryByText('VIP guests')).not.toBeInTheDocument()
    expect(screen.queryByText(/flight data/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Settings → System/)).not.toBeInTheDocument()
  })

  it('tells staff with no event to ask their Programme Manager, with no Events link', () => {
    mockApi(routes(summary()))
    renderWithApp(<DashboardScreen />, { ...sessionFor('coordinator'), event: null })

    expect(screen.getByText(/Ask your Programme Manager to add you/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Open Events/ })).not.toBeInTheDocument()
    expect(screen.queryByText('VIP guests')).not.toBeInTheDocument()
  })
})
