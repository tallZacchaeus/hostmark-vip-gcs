import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '@/tests/support/api-mock'
import { cleaningItem, cleaningView } from '@/tests/support/cleaning'
import { renderWithApp, sessionFor } from '@/tests/support/render'
import { SanitationScreen } from './SanitationScreen'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/sanitation' }))

const session = sessionFor('coordinator')

describe('SanitationScreen', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the queue in priority order with late rooms and reported problems', async () => {
    mockApi([
      {
        path: '/api/cleaning',
        body: cleaningView({
          summary: { not_started: 2, in_progress: 0, done_today: 4 },
          queue: [
            cleaningItem({ late_by_min: 15, problem_kind: 'supplies', problem_note: 'No towels' }),
            cleaningItem({ task_id: 't-2', room_number: '409', priority: 2, needed_by: null }),
          ],
        }),
      },
    ])
    renderWithApp(<SanitationScreen />, session)

    expect(await screen.findByText('Ready 15 min after it is needed')).toBeInTheDocument()
    expect(screen.getByText('Missing supplies: No towels')).toBeInTheDocument()
    expect(screen.getByLabelText('Priority 1')).toBeInTheDocument()
    expect(screen.getByText('Clean today').previousSibling).toHaveTextContent('4')
    expect(screen.getAllByRole('button', { name: 'Reverse check-out' })).toHaveLength(2)
  })

  it('reverses a check-out after confirming', async () => {
    const fetchMock = mockApi([
      { path: '/api/cleaning/t-1/reverse-checkout', method: 'POST', body: { room_number: '217', restored: 1 } },
      { path: '/api/cleaning', body: cleaningView({ queue: [cleaningItem({})] }) },
    ])
    renderWithApp(<SanitationScreen />, session)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Reverse check-out' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Reverse this check-out?' })).getByRole('button', { name: 'Reverse' }))

    expect(await screen.findByText('Check-out reversed. Room 217 is occupied again.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/reverse-checkout'))).toBe(true)
  })

  it('hides Reverse once cleaning has started, and lists the rooms done today', async () => {
    mockApi([
      {
        path: '/api/cleaning',
        body: cleaningView({
          queue: [cleaningItem({ status: 'in_progress', started_at: '2026-10-28T09:00:00.000Z' })],
          done: [cleaningItem({ task_id: 't-9', room_number: '201', status: 'done', completed_at: '2026-10-28T09:40:00.000Z' })],
          summary: { not_started: 0, in_progress: 1, done_today: 1 },
        }),
      },
    ])
    renderWithApp(<SanitationScreen />, session)
    const user = userEvent.setup()

    expect(await screen.findByText('In progress', { selector: '.arrival-badge' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reverse check-out' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Done today' }))
    expect(screen.getByText('1 room cleaned today')).toBeInTheDocument()
    expect(screen.getByText('201 at 10:40')).toBeInTheDocument()
  })

  it('shows the empty queue', async () => {
    mockApi([{ path: '/api/cleaning', body: cleaningView({}) }])
    renderWithApp(<SanitationScreen />, session)

    expect(await screen.findByText('No rooms are waiting. Everything is clean.')).toBeInTheDocument()
  })
})
