import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, type MockRoute } from '@/tests/support/api-mock'
import { requestsTo } from '@/tests/support/fetch-calls'
import { renderWithApp, sessionFor } from '@/tests/support/render'
import type { Account } from './types'
import { UsersTab } from './UsersTab'

const account = (overrides: Partial<Account>): Account => ({
  id: 'a-2',
  full_name: 'Tolu Adebayo',
  email: 'tolu@example.com',
  role: 'coordinator',
  phone: null,
  active: true,
  deactivation_reason: null,
  must_change_password: false,
  created_at: '2026-10-20T09:00:00Z',
  ...overrides,
})

const self = account({ id: 'u-1', full_name: 'Ada Nwosu', email: 'ada@example.com', role: 'admin' })
const tolu = account({})
const kemi = account({ id: 'a-3', full_name: 'Kemi Bello', email: 'kemi@example.com', role: 'driver', must_change_password: true })
const femi = account({ id: 'a-4', full_name: 'Femi Ojo', email: 'femi@example.com', role: 'housekeeping', active: false, deactivation_reason: 'Left the event' })
const owner = account({ id: 'a-5', full_name: 'Grace Okon', email: 'grace@example.com', role: 'super_admin' })
const accounts = [self, tolu, kemi, femi, owner]

const listRoute = (body: unknown = accounts): MockRoute => ({ path: '/api/admin/users', body })

function rowOf(name: string): HTMLElement {
  const row = screen.getByText(name).closest('[role="listitem"]')
  if (!(row instanceof HTMLElement)) throw new Error(`No row for ${name}`)
  return row
}

async function openMenuItem(user: ReturnType<typeof userEvent.setup>, name: string, item: string) {
  await user.click(screen.getByRole('button', { name: `Actions for ${name}` }))
  await user.click(screen.getByRole('menuitem', { name: item }))
}

describe('UsersTab', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists staff with their role and status, and offers actions only on accounts the admin may manage', async () => {
    mockApi([listRoute()])
    renderWithApp(<UsersTab />, sessionFor('admin'))

    expect(await screen.findByText('Tolu Adebayo')).toBeInTheDocument()
    expect(within(rowOf('Tolu Adebayo')).getByText('Event Coordinator')).toBeInTheDocument()
    expect(within(rowOf('Tolu Adebayo')).getByText('Active')).toBeInTheDocument()
    expect(within(rowOf('Kemi Bello')).getByText('Invited')).toBeInTheDocument()
    expect(within(rowOf('Femi Ojo')).getByText('Deactivated')).toHaveAttribute('title', 'Left the event')

    expect(screen.getByRole('button', { name: 'Actions for Tolu Adebayo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Actions for Ada Nwosu' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Actions for Grace Okon' })).not.toBeInTheDocument()
  })

  it('lets a super admin manage admins and other super admins', async () => {
    mockApi([listRoute()])
    renderWithApp(<UsersTab />, sessionFor('super_admin'))
    expect(await screen.findByRole('button', { name: 'Actions for Grace Okon' })).toBeInTheDocument()
  })

  it('says when no account matches and sends the search and role filter to the API', async () => {
    const fetchMock = mockApi([listRoute([])])
    const user = userEvent.setup()
    renderWithApp(<UsersTab />, sessionFor('admin'))

    expect(await screen.findByText('No users match.')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('Search by name or email'), 'kemi')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Role' }), 'driver')

    await waitFor(() =>
      expect(requestsTo(fetchMock, 'GET', '/api/admin/users').map((request) => request.url)).toContain('/api/admin/users?search=kemi&role=driver&limit=200'),
    )
  })

  it('shows a load failure with Retry, which asks again', async () => {
    const fetchMock = mockApi([{ path: '/api/admin/users', body: { code: 'internal_error', message: 'Could not load staff' }, status: 500 }])
    const user = userEvent.setup()
    renderWithApp(<UsersTab />, sessionFor('admin'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load staff')
    const before = requestsTo(fetchMock, 'GET', '/api/admin/users').length
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(requestsTo(fetchMock, 'GET', '/api/admin/users').length).toBeGreaterThan(before))
  })

  it('invites a user with roles the admin may assign, then shows the temporary password once', async () => {
    const created = account({ id: 'a-9', full_name: 'Ngozi Eze', email: 'ngozi@example.com', role: 'programs', must_change_password: true })
    const fetchMock = mockApi([
      listRoute(),
      { path: '/api/admin/users', method: 'POST', body: { account: created, temporary_password: 'Temp-Pass-4821' }, status: 201 },
    ])
    const user = userEvent.setup()
    renderWithApp(<UsersTab />, sessionFor('admin'))
    await screen.findByText('Tolu Adebayo')

    await user.click(screen.getByRole('button', { name: 'Invite user' }))
    const dialog = screen.getByRole('dialog', { name: 'Invite user' })
    const roleOptions = within(within(dialog).getByLabelText(/^Role/)).getAllByRole('option').map((option) => option.textContent)
    expect(roleOptions).not.toContain('Admin')
    expect(roleOptions).not.toContain('Super Admin')

    const submit = within(dialog).getByRole('button', { name: 'Create account' })
    await user.click(submit)
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter a name')
    await user.type(within(dialog).getByLabelText(/^Name/), '  Ngozi Eze ')
    await user.type(within(dialog).getByLabelText(/^Email/), 'ngozi@')
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter a valid email address')
    expect(within(dialog).getByRole('alert')).not.toHaveTextContent('Enter a name')
    await user.type(within(dialog).getByLabelText(/^Email/), 'example.com')
    await user.type(within(dialog).getByLabelText(/^Phone/), '+234 803 000 0002')
    await user.selectOptions(within(dialog).getByLabelText(/^Role/), 'programs')
    await user.click(submit)

    const passwordDialog = await screen.findByRole('dialog', { name: 'Temporary password for Ngozi Eze' })
    expect(within(passwordDialog).getByText('Temp-Pass-4821')).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'POST', '/api/admin/users')[0]?.body).toEqual({
      full_name: 'Ngozi Eze',
      email: 'ngozi@example.com',
      role: 'programs',
      phone: '+2348030000002',
    })

    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    await user.click(within(passwordDialog).getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('Temp-Pass-4821')
    expect(within(passwordDialog).getByRole('button', { name: 'Copied' })).toBeInTheDocument()

    await user.click(within(passwordDialog).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('confirms an emailed invitation without showing any password', async () => {
    // Arrange
    const created = account({ id: 'a-9', full_name: 'Ngozi Eze', email: 'ngozi@example.com', role: 'programs', must_change_password: true })
    mockApi([
      listRoute(),
      { path: '/api/admin/users', method: 'POST', body: { account: created, temporary_password: null, password_delivery: 'emailed' }, status: 201 },
    ])
    const user = userEvent.setup()
    renderWithApp(<UsersTab />, sessionFor('admin'))
    await screen.findByText('Tolu Adebayo')

    // Act
    await user.click(screen.getByRole('button', { name: 'Invite user' }))
    const dialog = screen.getByRole('dialog', { name: 'Invite user' })
    await user.type(within(dialog).getByLabelText(/^Name/), 'Ngozi Eze')
    await user.type(within(dialog).getByLabelText(/^Email/), 'ngozi@example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }))

    // Assert
    expect(await screen.findByText('Invitation emailed to ngozi@example.com. The link works for 72 hours.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('falls back to the temporary password, saying why, when the email could not be sent', async () => {
    // Arrange
    mockApi([
      listRoute(),
      { path: '/api/admin/users/a-2/reset-password', method: 'POST', body: { temporary_password: 'Reset-Pass-77', password_delivery: 'email_failed' } },
    ])
    const user = userEvent.setup()
    renderWithApp(<UsersTab />, sessionFor('admin'))
    await screen.findByText('Tolu Adebayo')

    // Act
    await openMenuItem(user, 'Tolu Adebayo', 'Reset password')
    await user.click(screen.getByRole('button', { name: 'Reset password' }))

    // Assert
    const passwordDialog = await screen.findByRole('dialog', { name: 'Temporary password for Tolu Adebayo' })
    expect(within(passwordDialog).getByText('Reset-Pass-77')).toBeInTheDocument()
    expect(within(passwordDialog).getByText(/The email could not be sent/)).toBeInTheDocument()
  })

  it('keeps the Copy label when the browser refuses clipboard access', async () => {
    mockApi([
      listRoute(),
      { path: '/api/admin/users/a-2/reset-password', method: 'POST', body: { temporary_password: 'Reset-Pass-77' } },
    ])
    const user = userEvent.setup()
    renderWithApp(<UsersTab />, sessionFor('admin'))
    await screen.findByText('Tolu Adebayo')

    await openMenuItem(user, 'Tolu Adebayo', 'Reset password')
    await user.click(screen.getByRole('button', { name: 'Reset password' }))
    const passwordDialog = await screen.findByRole('dialog', { name: 'Temporary password for Tolu Adebayo' })

    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    await user.click(within(passwordDialog).getByRole('button', { name: 'Copy' }))
    expect(within(passwordDialog).getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })

  it('shows why an invite was refused and keeps the dialog open', async () => {
    mockApi([
      listRoute(),
      { path: '/api/admin/users', method: 'POST', body: { code: 'conflict', message: 'An account with this email already exists' }, status: 409 },
    ])
    const user = userEvent.setup()
    renderWithApp(<UsersTab />, sessionFor('admin'))
    await screen.findByText('Tolu Adebayo')

    await user.click(screen.getByRole('button', { name: 'Invite user' }))
    const dialog = screen.getByRole('dialog', { name: 'Invite user' })
    await user.type(within(dialog).getByLabelText(/^Name/), 'Tolu Adebayo')
    await user.type(within(dialog).getByLabelText(/^Email/), 'tolu@example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('An account with this email already exists')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('changes a role only after a different role is picked, then confirms it', async () => {
    const fetchMock = mockApi([listRoute(), { path: '/api/admin/users/a-2', method: 'PATCH', body: account({ role: 'programs' }) }])
    const user = userEvent.setup()
    renderWithApp(<UsersTab />, sessionFor('admin'))
    await screen.findByText('Tolu Adebayo')

    await openMenuItem(user, 'Tolu Adebayo', 'Edit role')
    const dialog = screen.getByRole('dialog', { name: 'Edit role' })
    expect(within(dialog).getByText('Tolu Adebayo · tolu@example.com')).toBeInTheDocument()
    const save = within(dialog).getByRole('button', { name: 'Save role' })
    expect(save).toBeDisabled()
    await user.selectOptions(within(dialog).getByLabelText('Role'), 'programs')
    await user.click(save)

    expect(await screen.findByText("Tolu Adebayo's role was changed.")).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'PATCH', '/api/admin/users/a-2')[0]?.body).toEqual({ role: 'programs' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('deactivates a user with an optional reason', async () => {
    const fetchMock = mockApi([listRoute(), { path: '/api/admin/users/a-2', method: 'PATCH', body: account({ active: false }) }])
    const user = userEvent.setup()
    renderWithApp(<UsersTab />, sessionFor('admin'))
    await screen.findByText('Tolu Adebayo')

    await openMenuItem(user, 'Tolu Adebayo', 'Deactivate')
    const dialog = screen.getByRole('alertdialog', { name: 'Deactivate this user?' })
    await user.type(within(dialog).getByLabelText('Reason (optional)'), ' Contract ended ')
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }))

    expect(await screen.findByText('Tolu Adebayo was deactivated.')).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'PATCH', '/api/admin/users/a-2')[0]?.body).toEqual({ active: false, deactivation_reason: 'Contract ended' })
  })

  it('deactivates without a reason when none is given', async () => {
    const fetchMock = mockApi([listRoute(), { path: '/api/admin/users/a-2', method: 'PATCH', body: account({ active: false }) }])
    const user = userEvent.setup()
    renderWithApp(<UsersTab />, sessionFor('admin'))
    await screen.findByText('Tolu Adebayo')

    await openMenuItem(user, 'Tolu Adebayo', 'Deactivate')
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Deactivate' }))
    await screen.findByText('Tolu Adebayo was deactivated.')
    expect(requestsTo(fetchMock, 'PATCH', '/api/admin/users/a-2')[0]?.body).toEqual({ active: false })
  })

  it('reactivates a deactivated user straight from the menu', async () => {
    const fetchMock = mockApi([listRoute(), { path: '/api/admin/users/a-4', method: 'PATCH', body: account({ id: 'a-4', active: true }) }])
    const user = userEvent.setup()
    renderWithApp(<UsersTab />, sessionFor('admin'))
    await screen.findByText('Femi Ojo')

    await user.click(screen.getByRole('button', { name: 'Actions for Femi Ojo' }))
    expect(screen.queryByRole('menuitem', { name: 'Deactivate' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Reactivate' }))

    expect(await screen.findByText('Femi Ojo was reactivated.')).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'PATCH', '/api/admin/users/a-4')[0]?.body).toEqual({ active: true })
  })

  it('reports a failed reactivation in an error toast', async () => {
    mockApi([listRoute(), { path: '/api/admin/users/a-4', method: 'PATCH', body: { code: 'forbidden', message: 'You cannot manage this account' }, status: 403 }])
    const user = userEvent.setup()
    renderWithApp(<UsersTab />, sessionFor('admin'))
    await screen.findByText('Femi Ojo')

    await openMenuItem(user, 'Femi Ojo', 'Reactivate')
    expect(await screen.findByText('You cannot manage this account')).toBeInTheDocument()
  })

  it('closes the row menu when clicking elsewhere on the page', async () => {
    mockApi([listRoute()])
    const user = userEvent.setup()
    renderWithApp(<UsersTab />, sessionFor('admin'))
    await screen.findByText('Tolu Adebayo')

    await user.click(screen.getByRole('button', { name: 'Actions for Tolu Adebayo' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.click(document.body)
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })
})
