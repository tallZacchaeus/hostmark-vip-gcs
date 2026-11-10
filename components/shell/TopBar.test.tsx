import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithApp, sessionFor } from '@/tests/support/render'
import { TopBar } from './TopBar'

const navigation = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: navigation.push }), usePathname: () => '/dashboard' }))

const sessionActions = vi.hoisted(() => ({ signOut: vi.fn(async () => undefined) }))
vi.mock('@/lib/client/session-actions', () => sessionActions)

function renderTopBar(role: Parameters<typeof sessionFor>[0] = 'coordinator', unreadCount = 0) {
  const handlers = { onOpenMenu: vi.fn(), onOpenCopilot: vi.fn(), onOpenNotifications: vi.fn() }
  renderWithApp(<TopBar {...handlers} unreadCount={unreadCount} />, sessionFor(role))
  return handlers
}

describe('TopBar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T10:30:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    navigation.push.mockReset()
    sessionActions.signOut.mockClear()
  })

  it('shows the event, its local time and simulated flight data', () => {
    renderTopBar()
    expect(screen.getByText('Lagos Leadership Summit 2026')).toBeInTheDocument()
    expect(screen.getByLabelText('Event time')).toHaveTextContent('11:30 · Wed, 28 Oct 2026')
    expect(screen.getByRole('note')).toHaveTextContent('Simulated')
  })

  it('searches guests from anywhere in the console', async () => {
    const user = userEvent.setup()
    renderTopBar()
    const search = screen.getByRole('textbox', { name: 'Search guests' })

    await user.type(search, '   {Enter}')
    expect(navigation.push).not.toHaveBeenCalled()

    await user.clear(search)
    await user.type(search, ' Okafor & Sons {Enter}')
    expect(navigation.push).toHaveBeenCalledWith('/guests?q=Okafor%20%26%20Sons')
  })

  it('opens the menu, Victoria and notifications, naming the unread count', async () => {
    const user = userEvent.setup()
    const handlers = renderTopBar('coordinator', 3)

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('button', { name: 'Ask Victoria' }))
    await user.click(screen.getByRole('button', { name: 'Notifications, 3 unread' }))

    expect(handlers.onOpenMenu).toHaveBeenCalledTimes(1)
    expect(handlers.onOpenCopilot).toHaveBeenCalledTimes(1)
    expect(handlers.onOpenNotifications).toHaveBeenCalledTimes(1)
  })

  it('gives the programmes team neither guest search nor Victoria', () => {
    renderTopBar('programs')
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ask Victoria' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
  })

  it('offers password change and sign-out from the account menu', async () => {
    const user = userEvent.setup()
    renderTopBar()
    const avatar = screen.getByRole('button', { name: 'Account menu for Ada Nwosu' })
    expect(avatar).toHaveTextContent('AN')

    await user.click(avatar)
    expect(avatar).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menuitem', { name: 'Change password' })).toHaveAttribute('href', '/account/password')
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(sessionActions.signOut).toHaveBeenCalledTimes(1)
  })

  it('closes the account menu on Escape or a click elsewhere', async () => {
    const user = userEvent.setup()
    renderTopBar()
    const avatar = screen.getByRole('button', { name: 'Account menu for Ada Nwosu' })

    await user.click(avatar)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await user.click(avatar)
    fireEvent.click(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
