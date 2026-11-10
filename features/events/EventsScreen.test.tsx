import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '@/tests/support/api-mock'
import { renderWithApp, sessionFor } from '@/tests/support/render'
import { EventsScreen } from './EventsScreen'
import type { ManagedEvent } from './types'

const navigate = vi.hoisted(() => ({ to: vi.fn() }))
vi.mock('@/lib/client/navigate', () => ({ navigateTo: navigate.to }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

const SUMMIT: ManagedEvent = {
  id: 'e-1',
  name: 'Lagos Leadership Summit 2026',
  venue_name: 'Harbour Point Hotel',
  status: 'live',
  starts_on: '2026-10-28',
  ends_on: '2026-10-31',
  owner_id: 'u-1',
  owner_name: 'Ada Nwosu',
  member_count: 12,
  is_current: true,
}
const FORUM: ManagedEvent = { ...SUMMIT, id: 'e-2', name: 'Abuja Investment Forum', status: 'draft', member_count: 0, is_current: false }

/** The JSON bodies sent with `method` to paths starting with `path`. */
function bodiesSent(fetchMock: ReturnType<typeof mockApi>, method: string, path: string): unknown[] {
  return fetchMock.mock.calls
    .filter(([input, init]) => String(input).startsWith(path) && (init?.method ?? 'GET') === method)
    .map(([, init]) => JSON.parse(String(init?.body ?? 'null')))
}

const card = async (name: string) => (await screen.findByRole('heading', { name })).closest('article') as HTMLElement

describe('EventsScreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    navigate.to.mockReset()
  })

  it('lists the events with their status and team size', async () => {
    // Arrange
    mockApi([{ path: '/api/events', body: [SUMMIT, FORUM] }])

    // Act
    renderWithApp(<EventsScreen />, sessionFor('programme_manager'))

    // Assert
    const summit = await card('Lagos Leadership Summit 2026')
    expect(within(summit).getByText('Live')).toBeInTheDocument()
    expect(within(summit).getByText(/12 staff/)).toBeInTheDocument()
    expect(within(await card('Abuja Investment Forum')).getByText('Draft')).toBeInTheDocument()
  })

  it('takes a draft live', async () => {
    // Arrange
    const fetchMock = mockApi([
      { path: '/api/events/e-2', method: 'PATCH', body: { id: 'e-2', status: 'live' } },
      { path: '/api/events', body: [SUMMIT, FORUM] },
    ])
    const user = userEvent.setup()
    renderWithApp(<EventsScreen />, sessionFor('programme_manager'))

    // Act
    await user.click(within(await card('Abuja Investment Forum')).getByRole('button', { name: 'Go live' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Go live' }))

    // Assert
    await waitFor(() => expect(bodiesSent(fetchMock, 'PATCH', '/api/events/e-2')).toEqual([{ status: 'live' }]))
  })

  it('archives an event only after confirming', async () => {
    // Arrange
    const fetchMock = mockApi([
      { path: '/api/events/e-1', method: 'PATCH', body: { id: 'e-1', status: 'archived' } },
      { path: '/api/events', body: [SUMMIT, FORUM] },
    ])
    const user = userEvent.setup()
    renderWithApp(<EventsScreen />, sessionFor('programme_manager'))

    // Act
    await user.click(within(await card('Lagos Leadership Summit 2026')).getByRole('button', { name: 'Archive' }))
    const confirm = screen.getByRole('alertdialog')

    // Assert
    expect(confirm).toHaveTextContent(/read-only/)
    expect(bodiesSent(fetchMock, 'PATCH', '/api/events/e-1')).toEqual([])
    await user.click(within(confirm).getByRole('button', { name: 'Archive event' }))
    await waitFor(() => expect(bodiesSent(fetchMock, 'PATCH', '/api/events/e-1')).toEqual([{ status: 'archived' }]))
  })

  it("puts a person on an event's team", async () => {
    // Arrange
    const fetchMock = mockApi([
      { path: '/api/events/e-2/staff', method: 'PUT', body: { profile_id: 'p-1', member: true } },
      { path: '/api/events/e-2/staff', body: [{ id: 'p-1', full_name: 'Musa Bello', email: 'musa@example.com', role: 'driver', is_member: false }] },
      { path: '/api/events', body: [SUMMIT, FORUM] },
    ])
    const user = userEvent.setup()
    renderWithApp(<EventsScreen />, sessionFor('programme_manager'))

    // Act
    await user.click(within(await card('Abuja Investment Forum')).getByRole('button', { name: 'Team' }))
    await user.click(await screen.findByRole('checkbox', { name: /Musa Bello/ }))

    // Assert
    await waitFor(() => expect(bodiesSent(fetchMock, 'PUT', '/api/events/e-2/staff')).toEqual([{ profile_id: 'p-1', member: true }]))
  })

  it('copies chosen parts of an earlier event into a draft', async () => {
    // Arrange
    const fetchMock = mockApi([
      { path: '/api/events/e-2/copy', method: 'POST', body: { room_types: 2, rooms: 40 } },
      { path: '/api/events', body: [SUMMIT, FORUM] },
    ])
    const user = userEvent.setup()
    renderWithApp(<EventsScreen />, sessionFor('programme_manager'))

    // Act
    await user.click(within(await card('Abuja Investment Forum')).getByRole('button', { name: 'Copy setup' }))
    const dialog = screen.getByRole('dialog')
    for (const part of ['Settings', 'VIP categories', 'Drivers', 'Staff']) {
      await user.click(within(dialog).getByRole('checkbox', { name: new RegExp(part) }))
    }
    await user.click(within(dialog).getByRole('button', { name: 'Copy' }))

    // Assert
    await waitFor(() =>
      expect(bodiesSent(fetchMock, 'POST', '/api/events/e-2/copy')).toEqual([{ from_event_id: 'e-1', parts: ['rooms'] }]),
    )
    expect(await screen.findByText(/Copied 2 room types, 40 rooms/)).toBeInTheDocument()
  })

  it('opens an event to work in it', async () => {
    // Arrange
    const fetchMock = mockApi([
      { path: '/api/me/event', method: 'PUT', body: { event_id: 'e-2' } },
      { path: '/api/events', body: [SUMMIT, FORUM] },
    ])
    const user = userEvent.setup()
    renderWithApp(<EventsScreen />, sessionFor('programme_manager'))

    // Act
    await user.click(within(await card('Abuja Investment Forum')).getByRole('button', { name: 'Work in this event' }))

    // Assert
    await waitFor(() => expect(navigate.to).toHaveBeenCalledWith('/settings?tab=system'))
    expect(bodiesSent(fetchMock, 'PUT', '/api/me/event')).toEqual([{ event_id: 'e-2' }])
  })
})
