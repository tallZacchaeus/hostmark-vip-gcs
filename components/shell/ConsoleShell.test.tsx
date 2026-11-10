import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/Toast'
import { mockApi, type MockRoute } from '@/tests/support/api-mock'
import { installEventSource } from '@/tests/support/event-source'
import { requestsTo } from '@/tests/support/fetch-calls'
import { renderWithApp, sessionFor } from '@/tests/support/render'
import { ConsoleShell } from './ConsoleShell'

const consoleRoutes = (unread = 2, intake = 4): MockRoute[] => [
  { path: '/api/notifications', body: { items: [], unread_count: unread } },
  { path: '/api/dashboard/summary', body: { intake_to_review: intake } },
]

describe('ConsoleShell', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('frames the screen with a skip link, the sidebar counts and the unread notifications', async () => {
    installEventSource()
    mockApi(consoleRoutes())
    renderWithApp(
      <ConsoleShell session={sessionFor('coordinator')}>
        <main>Dashboard content</main>
      </ConsoleShell>,
    )

    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main-content')
    expect(screen.getByText('Dashboard content')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Notifications, 2 unread' })).toBeInTheDocument()
    expect(await screen.findByLabelText('4 waiting')).toBeInTheDocument()
  })

  it('does not load the coordinator summary for the programmes team', async () => {
    installEventSource()
    const fetchMock = mockApi(consoleRoutes(0))
    renderWithApp(
      <ConsoleShell session={sessionFor('programs')}>
        <main>Programme</main>
      </ConsoleShell>,
      sessionFor('programs'),
    )

    await vi.waitFor(() => expect(requestsTo(fetchMock, 'GET', '/api/notifications')).toHaveLength(1))
    expect(requestsTo(fetchMock, 'GET', '/api/dashboard/summary')).toHaveLength(0)
    expect(screen.queryByLabelText(/waiting/)).not.toBeInTheDocument()
  })

  it('opens and closes the menu on small screens', async () => {
    installEventSource()
    mockApi(consoleRoutes())
    const user = userEvent.setup()
    renderWithApp(<ConsoleShell session={sessionFor('coordinator')}>content</ConsoleShell>)

    expect(screen.queryByRole('button', { name: 'Close menu' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(screen.queryByRole('button', { name: 'Close menu' })).not.toBeInTheDocument()
  })

  it('opens the notifications drawer and Victoria one at a time', async () => {
    installEventSource()
    mockApi(consoleRoutes())
    const user = userEvent.setup()
    renderWithApp(<ConsoleShell session={sessionFor('coordinator')}>content</ConsoleShell>)

    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close notifications' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ask Victoria' }))
    expect(await screen.findByRole('dialog', { name: 'Ask Victoria' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close Victoria' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('refreshes data whenever the server announces a change, and stops listening when closed', async () => {
    const latestStream = installEventSource()
    const fetchMock = mockApi(consoleRoutes())
    // The app's default SWR cache, which the live refresh revalidates.
    const { unmount } = render(
      <SWRConfig value={{ dedupingInterval: 0 }}>
        <ToastProvider>
          <ConsoleShell session={sessionFor('coordinator')}>content</ConsoleShell>
        </ToastProvider>
      </SWRConfig>,
    )
    await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    const stream = latestStream()
    expect(stream.url).toBe('/api/notifications/stream')
    const loads = requestsTo(fetchMock, 'GET', '/api/notifications').length

    act(() => stream.emit('notification', 'not json'))
    expect(requestsTo(fetchMock, 'GET', '/api/notifications')).toHaveLength(loads)

    act(() => stream.emit('notification', JSON.stringify({ id: 'n-9', kind: 'flight_delayed', priority: 'high' })))
    await vi.waitFor(() => expect(requestsTo(fetchMock, 'GET', '/api/notifications').length).toBeGreaterThan(loads))

    unmount()
    expect(stream.closed).toBe(true)
  })
})
