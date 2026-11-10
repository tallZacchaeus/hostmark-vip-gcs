import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '@/tests/support/api-mock'
import { renderWithApp, sessionFor } from '@/tests/support/render'
import { SettingsScreen } from './SettingsScreen'

const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: '' }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: navigation.replace, refresh: vi.fn() }),
  usePathname: () => '/settings',
  useSearchParams: () => new URLSearchParams(navigation.search),
}))

function mockSettingsApi() {
  return mockApi([
    { path: '/api/admin/users', body: [] },
    { path: '/api/admin/room-types', body: [] },
    { path: '/api/admin/rooms', body: [], meta: { total: 0, page: 1, limit: 200 } },
    { path: '/api/admin/drivers', body: [], meta: { total: 0, page: 1, limit: 200 } },
    { path: '/api/admin/vip-categories', body: [] },
  ])
}

describe('SettingsScreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    navigation.replace.mockReset()
    navigation.search = ''
  })

  it('gives coordinators the VIP categories only', async () => {
    mockSettingsApi()
    renderWithApp(<SettingsScreen />, sessionFor('coordinator'))

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['VIP categories'])
    expect(screen.getByRole('tab', { name: 'VIP categories' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('heading', { name: 'VIP categories', level: 2 })).toBeInTheDocument()
  })

  it('opens Users first for admins and switches tabs through the URL', async () => {
    mockSettingsApi()
    const user = userEvent.setup()
    renderWithApp(<SettingsScreen />, sessionFor('admin'))

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Users', 'Rooms', 'Drivers', 'VIP categories', 'System'])
    expect(screen.getByRole('tab', { name: 'Users' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'settings-tab-users')
    expect(await screen.findByText('No users match.')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Rooms' }))
    expect(navigation.replace).toHaveBeenCalledWith('/settings?tab=rooms', { scroll: false })
  })

  it('opens the tab named in the URL', async () => {
    navigation.search = 'tab=drivers'
    mockSettingsApi()
    renderWithApp(<SettingsScreen />, sessionFor('admin'))

    expect(screen.getByRole('tab', { name: 'Drivers' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('heading', { name: 'Drivers', level: 2 })).toBeInTheDocument()
  })

  it('ignores a tab in the URL that the role may not open', async () => {
    navigation.search = 'tab=users'
    mockSettingsApi()
    renderWithApp(<SettingsScreen />, sessionFor('coordinator'))

    expect(screen.queryByRole('tab', { name: 'Users' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'VIP categories' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('heading', { name: 'VIP categories', level: 2 })).toBeInTheDocument()
  })
})
