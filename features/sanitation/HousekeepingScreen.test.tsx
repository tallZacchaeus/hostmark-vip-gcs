import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, sentBody } from '@/tests/support/api-mock'
import { cleaningItem, cleaningView } from '@/tests/support/cleaning'
import { renderWithApp, sessionFor } from '@/tests/support/render'
import { HousekeepingScreen } from './HousekeepingScreen'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/staff/sanitation' }))

const session = sessionFor('housekeeping')

describe('HousekeepingScreen', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lists rooms in priority order with the next step for each', async () => {
    mockApi([
      {
        path: '/api/cleaning',
        body: cleaningView({
          summary: { not_started: 1, in_progress: 1, done_today: 1 },
          queue: [cleaningItem({ task_id: 't-2', room_number: '504', status: 'in_progress', started_at: '2026-10-28T10:02:00.000Z' }), cleaningItem({ needed_by: null })],
          done: [cleaningItem({ task_id: 't-3', room_number: '201', status: 'done', completed_at: '2026-10-28T09:40:00.000Z' })],
        }),
      },
    ])
    renderWithApp(<HousekeepingScreen />, session)

    const busy = await screen.findByRole('article', { name: 'Room 504' })
    expect(within(busy).getByText('Started 11:02')).toBeInTheDocument()
    expect(within(busy).getByRole('button', { name: 'Mark ready' })).toBeInTheDocument()
    const waiting = screen.getByRole('article', { name: 'Room 217' })
    expect(within(waiting).getByText('No deadline')).toBeInTheDocument()
    expect(within(waiting).getByRole('button', { name: 'Start cleaning' })).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Room 201' })).getByText('Marked ready 10:40')).toBeInTheDocument()
    expect(screen.getAllByRole('article').map((card) => card.getAttribute('aria-label'))).toEqual(['Room 504', 'Room 217', 'Room 201'])
  })

  it('starts a room, and marks it ready after confirming, with Undo', async () => {
    const fetchMock = mockApi([
      { path: '/api/cleaning/t-1/start', method: 'POST', body: { status: 'in_progress' } },
      { path: '/api/cleaning/t-2/complete', method: 'POST', body: { status: 'done' } },
      { path: '/api/cleaning/t-2/undo-complete', method: 'POST', body: { status: 'in_progress' } },
      { path: '/api/cleaning', body: cleaningView({ queue: [cleaningItem({ task_id: 't-2', room_number: '504', status: 'in_progress', started_at: '2026-10-28T10:02:00.000Z' }), cleaningItem({})] }) },
    ])
    renderWithApp(<HousekeepingScreen />, session)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Start cleaning' }))
    expect(await screen.findByText('Started room 217.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mark ready' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Room 504 is ready?' })).getByRole('button', { name: 'Mark ready' }))
    expect(await screen.findByText('Room 504 is ready.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('Room 504 is back in progress.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/undo-complete'))).toBe(true)
  })

  it('reports a problem with a chosen kind and a note', async () => {
    const fetchMock = mockApi([
      { path: '/api/cleaning/t-1/report', method: 'POST', body: { problem_kind: 'maintenance' } },
      { path: '/api/cleaning', body: cleaningView({ queue: [cleaningItem({})] }) },
    ])
    renderWithApp(<HousekeepingScreen />, session)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Report a problem' }))
    const sheet = screen.getByRole('dialog', { name: 'Report a problem' })
    expect(within(sheet).getByRole('button', { name: 'Send report' })).toBeDisabled()
    await user.click(within(sheet).getByRole('radio', { name: 'Maintenance needed' }))
    await user.type(within(sheet).getByRole('textbox', { name: 'Add a note (optional)' }), 'Shower leaking')
    await user.click(within(sheet).getByRole('button', { name: 'Send report' }))

    expect(await screen.findByText('Reported. The coordinators have been told about room 217.')).toBeInTheDocument()
    const reportCall = fetchMock.mock.calls.findIndex(([url]) => String(url).endsWith('/report'))
    expect(sentBody(fetchMock, reportCall)).toEqual({ kind: 'maintenance', note: 'Shower leaking' })
  })

  it('shows the empty state, and the profile with sign out', async () => {
    mockApi([{ path: '/api/cleaning', body: cleaningView({}) }])
    renderWithApp(<HousekeepingScreen />, session)
    const user = userEvent.setup()

    expect(await screen.findByText('All rooms are ready. Nice work.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Profile' }))
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('shows the error when the queue cannot load', async () => {
    mockApi([{ path: '/api/cleaning', status: 500, body: { code: 'internal', message: 'Something went wrong' } }])
    renderWithApp(<HousekeepingScreen />, session)

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
  })
})
