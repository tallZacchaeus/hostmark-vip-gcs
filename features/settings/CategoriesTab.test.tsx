import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, type MockRoute } from '@/tests/support/api-mock'
import { requestsTo } from '@/tests/support/fetch-calls'
import { renderWithApp } from '@/tests/support/render'
import { CategoriesTab } from './CategoriesTab'
import type { VipCategory } from './types'

const headOfState: VipCategory = { id: 'c-1', name: 'Head of State', rank: 1, preferred_room_tier: 1 }
const minister: VipCategory = { id: 'c-2', name: 'Minister', rank: 2, preferred_room_tier: null }
const dignitary: VipCategory = { id: 'c-3', name: 'Dignitary', rank: 3, preferred_room_tier: 2 }

// Deliberately out of order: the tab sorts by rank.
const routes = (extra: readonly MockRoute[] = []): MockRoute[] => [...extra, { path: '/api/admin/vip-categories', body: [dignitary, headOfState, minister] }]

function names(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[1]?.textContent ?? '')
}

describe('CategoriesTab', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists categories highest rank first with their preferred room tier', async () => {
    mockApi(routes())
    renderWithApp(<CategoriesTab />)

    await screen.findByText('Head of State')
    expect(names()).toEqual(['Head of State', 'Minister', 'Dignitary'])
    expect(screen.getByText('Tier 1')).toBeInTheDocument()
    expect(screen.getByText('No preference')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move Head of State up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Dignitary down' })).toBeDisabled()
  })

  it('moves a category up by sending the new order', async () => {
    const fetchMock = mockApi(routes([{ path: '/api/admin/vip-categories/reorder', method: 'POST', body: [] }]))
    const user = userEvent.setup()
    renderWithApp(<CategoriesTab />)
    await screen.findByText('Minister')

    await user.click(screen.getByRole('button', { name: 'Move Minister up' }))
    await vi.waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/admin/vip-categories/reorder')).toHaveLength(1))
    expect(requestsTo(fetchMock, 'POST', '/api/admin/vip-categories/reorder')[0]?.body).toEqual({ ids: ['c-2', 'c-1', 'c-3'] })
  })

  it('moves a category down and shows a refused reorder', async () => {
    const fetchMock = mockApi(
      routes([{ path: '/api/admin/vip-categories/reorder', method: 'POST', body: { code: 'conflict', message: 'The list changed; reload and try again' }, status: 409 }]),
    )
    const user = userEvent.setup()
    renderWithApp(<CategoriesTab />)
    await screen.findByText('Minister')

    await user.click(screen.getByRole('button', { name: 'Move Head of State down' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The list changed; reload and try again')
    expect(requestsTo(fetchMock, 'POST', '/api/admin/vip-categories/reorder')[0]?.body).toEqual({ ids: ['c-2', 'c-1', 'c-3'] })
  })

  it('shows a load failure with Retry', async () => {
    mockApi([{ path: '/api/admin/vip-categories', body: { code: 'internal_error', message: 'Categories are unavailable' }, status: 500 }])
    renderWithApp(<CategoriesTab />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Categories are unavailable')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('adds a category at the bottom of the ranking', async () => {
    const fetchMock = mockApi(routes([{ path: '/api/admin/vip-categories', method: 'POST', body: { id: 'c-4' }, status: 201 }]))
    const user = userEvent.setup()
    renderWithApp(<CategoriesTab />)
    await screen.findByText('Minister')

    await user.click(screen.getByRole('button', { name: 'Add category' }))
    const dialog = screen.getByRole('dialog', { name: 'Add VIP category' })
    const submit = within(dialog).getByRole('button', { name: 'Add category' })
    await user.click(submit)
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter a name')
    await user.type(within(dialog).getByLabelText(/^Name/), ' Traditional Ruler ')
    await user.click(submit)

    expect(await screen.findByText('VIP category saved.')).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'POST', '/api/admin/vip-categories')[0]?.body).toEqual({ name: 'Traditional Ruler', preferred_room_tier: null, rank: 4 })
  })

  it('starts the first category at rank 1', async () => {
    const fetchMock = mockApi([
      { path: '/api/admin/vip-categories', method: 'POST', body: { id: 'c-1' }, status: 201 },
      { path: '/api/admin/vip-categories', body: [] },
    ])
    const user = userEvent.setup()
    renderWithApp(<CategoriesTab />)
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    const dialog = screen.getByRole('dialog', { name: 'Add VIP category' })
    await user.type(within(dialog).getByLabelText(/^Name/), 'Head of State')
    await user.type(within(dialog).getByLabelText(/^Preferred room tier/), '1')
    await user.click(within(dialog).getByRole('button', { name: 'Add category' }))

    await screen.findByText('VIP category saved.')
    expect(requestsTo(fetchMock, 'POST', '/api/admin/vip-categories')[0]?.body).toEqual({ name: 'Head of State', preferred_room_tier: 1, rank: 1 })
  })

  it('edits a category without changing its rank', async () => {
    const fetchMock = mockApi(routes([{ path: '/api/admin/vip-categories/c-3', method: 'PATCH', body: dignitary }]))
    const user = userEvent.setup()
    renderWithApp(<CategoriesTab />)
    await screen.findByText('Dignitary')

    await user.click(screen.getByRole('button', { name: 'Edit Dignitary' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit VIP category' })
    const tier = within(dialog).getByLabelText(/^Preferred room tier/)
    expect(tier).toHaveValue(2)
    await user.clear(tier)
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await screen.findByText('VIP category saved.')
    expect(requestsTo(fetchMock, 'PATCH', '/api/admin/vip-categories/c-3')[0]?.body).toEqual({ name: 'Dignitary', preferred_room_tier: null })
  })

  it('deletes a category after confirmation', async () => {
    const fetchMock = mockApi(routes([{ path: '/api/admin/vip-categories/c-2', method: 'DELETE', body: { id: 'c-2' } }]))
    const user = userEvent.setup()
    renderWithApp(<CategoriesTab />)
    await screen.findByText('Minister')

    await user.click(screen.getByRole('button', { name: 'Delete Minister' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete VIP category Minister?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('VIP category deleted.')).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'DELETE', '/api/admin/vip-categories/c-2')).toHaveLength(1)
  })

  it('closes a dialog on Cancel without saving', async () => {
    const fetchMock = mockApi(routes())
    const user = userEvent.setup()
    renderWithApp(<CategoriesTab />)
    await screen.findByText('Minister')

    await user.click(screen.getByRole('button', { name: 'Delete Minister' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(requestsTo(fetchMock, 'DELETE', '/api/admin/vip-categories')).toHaveLength(0)
  })
})
