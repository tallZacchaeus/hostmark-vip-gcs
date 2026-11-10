import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, type MockRoute } from '@/tests/support/api-mock'
import { requestsTo } from '@/tests/support/fetch-calls'
import { renderWithApp, sessionFor } from '@/tests/support/render'
import { type NotificationItem, type NotificationList, NotificationsDrawer } from './NotificationsDrawer'

const navigation = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: navigation.push }), usePathname: () => '/dashboard' }))

const item = (overrides: Partial<NotificationItem>): NotificationItem => ({
  id: 'n-1',
  kind: 'flight_delayed',
  priority: 'high',
  title: 'EK783 is 45 minutes late',
  body: 'Bishop Augustine Okafor now lands at 15:10.',
  entity_type: 'flights',
  entity_id: 'f-1',
  created_at: '2026-10-28T13:05:00Z',
  read_at: null,
  ...overrides,
})

const delayed = item({})
const cleaned = item({
  id: 'n-2',
  kind: 'room_ready',
  priority: 'normal',
  title: 'Room 412 is ready',
  body: null,
  entity_type: 'rooms',
  entity_id: 'r-412',
  created_at: '2026-10-28T11:00:00Z',
  read_at: '2026-10-28T12:00:00Z',
})
const unknown = item({ id: 'n-3', kind: 'note', priority: 'normal', title: 'Shift starts soon', body: null, entity_type: null, entity_id: null, read_at: '2026-10-28T12:00:00Z' })

const listRoute = (list: NotificationList): MockRoute => ({ path: '/api/notifications', body: list })
const readRoute: MockRoute = { path: '/api/notifications/read', method: 'POST', body: { updated: 1 } }

describe('NotificationsDrawer', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    navigation.push.mockReset()
  })

  it('lists notifications with the unread ones marked and the time in the event zone', async () => {
    mockApi([listRoute({ items: [delayed, cleaned], unread_count: 1 })])
    renderWithApp(<NotificationsDrawer onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(await screen.findByText('1 unread')).toBeInTheDocument()
    expect(screen.getByText('EK783 is 45 minutes late')).toBeInTheDocument()
    expect(screen.getByText('Bishop Augustine Okafor now lands at 15:10.')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Unread')).toHaveLength(1)
    expect(screen.getByText('14:05')).toBeInTheDocument()
    expect(screen.getByText('12:00')).toBeInTheDocument()
  })

  it('says when nothing needs attention', async () => {
    mockApi([listRoute({ items: [], unread_count: 0 })])
    renderWithApp(<NotificationsDrawer onClose={vi.fn()} />)
    expect(await screen.findByText('Nothing needs your attention.')).toBeInTheDocument()
    expect(screen.getByText('All caught up')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument()
  })

  it('marks everything as read', async () => {
    const fetchMock = mockApi([readRoute, listRoute({ items: [delayed], unread_count: 1 })])
    renderWithApp(<NotificationsDrawer onClose={vi.fn()} />)

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Mark all as read' }))
    await vi.waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/notifications/read')).toHaveLength(1))
    expect(requestsTo(fetchMock, 'POST', '/api/notifications/read')[0]?.body).toEqual({})
  })

  it('opens an unread notification: marks it read, closes and goes to the record', async () => {
    const fetchMock = mockApi([readRoute, listRoute({ items: [delayed], unread_count: 1 })])
    const onClose = vi.fn()
    renderWithApp(<NotificationsDrawer onClose={onClose} />)

    await userEvent.setup().click(await screen.findByRole('button', { name: /EK783 is 45 minutes late/ }))

    expect(onClose).toHaveBeenCalled()
    expect(navigation.push).toHaveBeenCalledWith('/arrivals')
    await vi.waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/notifications/read')[0]?.body).toEqual({ ids: ['n-1'] }))
  })

  it('sends staff to their own app, and does not re-mark read notifications', async () => {
    const fetchMock = mockApi([listRoute({ items: [cleaned, unknown], unread_count: 0 })])
    const onClose = vi.fn()
    renderWithApp(<NotificationsDrawer onClose={onClose} />, sessionFor('housekeeping'))
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Room 412 is ready/ }))
    expect(navigation.push).toHaveBeenCalledWith('/staff/sanitation')

    await user.click(screen.getByRole('button', { name: /Shift starts soon/ }))
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(navigation.push).toHaveBeenCalledTimes(1)
    expect(requestsTo(fetchMock, 'POST', '/api/notifications/read')).toHaveLength(0)
  })

  it('reports a failed mark-as-read in a toast', async () => {
    mockApi([
      { path: '/api/notifications/read', method: 'POST', body: { code: 'internal_error', message: 'Could not update notifications' }, status: 500 },
      listRoute({ items: [delayed], unread_count: 1 }),
    ])
    renderWithApp(<NotificationsDrawer onClose={vi.fn()} />)

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Mark all as read' }))
    expect(await screen.findByText('Could not update notifications')).toBeInTheDocument()
  })

  it('shows a load failure with Retry, and closes from its button', async () => {
    mockApi([{ path: '/api/notifications', body: { code: 'internal_error', message: 'Notifications are unavailable' }, status: 500 }])
    const onClose = vi.fn()
    renderWithApp(<NotificationsDrawer onClose={onClose} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Notifications are unavailable')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close notifications' }))
    expect(onClose).toHaveBeenCalled()
  })
})
