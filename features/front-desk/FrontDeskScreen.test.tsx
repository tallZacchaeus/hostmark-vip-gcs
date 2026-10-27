import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DeskParty, FrontDesk } from '@/lib/repositories/front-desk'
import { mockApi } from '@/tests/support/api-mock'
import { renderWithApp, sessionFor } from '@/tests/support/render'
import { FrontDeskScreen } from './FrontDeskScreen'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/staff/front-desk' }))

const party = (overrides: Partial<DeskParty>): DeskParty => ({
  delegation_id: 'd-1',
  principal_guest_id: 'g-1',
  name: 'Bishop Augustine Okafor',
  category: 'Cat. 1',
  party_size: 2,
  rooms: ['301'],
  rooms_ready: true,
  on_the_way: true,
  check_in: '2026-10-28T13:00:00.000Z',
  check_out: '2026-10-31T11:00:00.000Z',
  checked_in_at: null,
  checked_in_by: null,
  ...overrides,
})

const desk = (overrides: Partial<FrontDesk>): FrontDesk => ({ day: '2026-10-28', timezone: 'Africa/Lagos', arriving: [], in_house: [], leaving: [], ...overrides })
const deskSession = sessionFor('accommodation')

describe('FrontDeskScreen', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lists arriving parties and blocks check-in while a room is not ready', async () => {
    mockApi([{ path: '/api/front-desk', body: desk({ arriving: [party({}), party({ delegation_id: 'd-2', name: 'Dr Ngozi Eze', rooms: ['104'], rooms_ready: false, on_the_way: false })] }) }])
    renderWithApp(<FrontDeskScreen />, deskSession)

    const ready = await screen.findByRole('article', { name: 'Bishop Augustine Okafor' })
    expect(within(ready).getByText('On the way')).toBeInTheDocument()
    expect(within(ready).getByText('Cat. 1 · Expected 14:00')).toBeInTheDocument()
    expect(within(ready).getByRole('button', { name: 'Check in' })).toBeEnabled()
    const blocked = screen.getByRole('article', { name: 'Dr Ngozi Eze' })
    expect(within(blocked).getByText('Room 104 not ready')).toBeInTheDocument()
    expect(within(blocked).getByRole('button', { name: 'Check in' })).toBeDisabled()
    expect(within(blocked).getByText('Housekeeping is on it.')).toBeInTheDocument()
  })

  it('checks a party in after confirming, with Undo in the toast', async () => {
    const fetchMock = mockApi([
      { path: '/api/front-desk/d-1/check-in', method: 'POST', body: { delegation_id: 'd-1', rooms: ['301'] } },
      { path: '/api/front-desk/d-1/undo-check-in', method: 'POST', body: { delegation_id: 'd-1' } },
      { path: '/api/front-desk', body: desk({ arriving: [party({})] }) },
    ])
    renderWithApp(<FrontDeskScreen />, deskSession)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Check in' }))
    const sheet = screen.getByRole('dialog', { name: 'Check in Bishop Augustine Okafor to room 301?' })
    await user.click(within(sheet).getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText('Checked in')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('Check-in undone for Bishop Augustine Okafor.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/undo-check-in'))).toBe(true)
  })

  it('tells the second person who already checked the party in', async () => {
    mockApi([
      { path: '/api/front-desk/d-1/check-in', method: 'POST', status: 409, body: { code: 'already_checked_in', message: 'Already checked in', details: { by: 'Funmi Adeyemi', at: '2026-10-28T13:05:00.000Z' } } },
      { path: '/api/front-desk', body: desk({ arriving: [party({})] }) },
    ])
    renderWithApp(<FrontDeskScreen />, deskSession)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Check in' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText('Already checked in by Funmi Adeyemi at 14:05.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check in' })).not.toBeInTheDocument()
  })

  it('checks an in-house party out after confirming; the rooms go to housekeeping', async () => {
    const fetchMock = mockApi([
      { path: '/api/front-desk/d-1/check-out', method: 'POST', body: { delegation_id: 'd-1', rooms: ['301', '302'] } },
      { path: '/api/front-desk', body: desk({ in_house: [party({ rooms: ['301', '302'], checked_in_at: '2026-10-28T13:05:00.000Z' })] }) },
    ])
    renderWithApp(<FrontDeskScreen />, deskSession)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'In house' }))
    await user.click(screen.getByRole('button', { name: 'Check out' }))
    const sheet = screen.getByRole('dialog', { name: 'Check out Bishop Augustine Okafor from rooms 301, 302?' })
    expect(within(sheet).getByText('The rooms go to housekeeping.')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText('Checked out. The rooms go to housekeeping.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/check-out') && init?.method === 'POST')).toBe(true)
  })

  it('tells the second person who already checked the party out', async () => {
    mockApi([
      { path: '/api/front-desk/d-1/check-out', method: 'POST', status: 409, body: { code: 'already_checked_out', message: 'Already checked out', details: { by: 'Tolu Front', at: '2026-10-31T10:02:00.000Z' } } },
      { path: '/api/front-desk', body: desk({ leaving: [party({})], in_house: [party({})] }) },
    ])
    renderWithApp(<FrontDeskScreen />, deskSession)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Leaving' }))
    await user.click(screen.getByRole('button', { name: 'Check out' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText('Already checked out by Tolu Front at 11:02.')).toBeInTheDocument()
  })

  it('switches tabs and searches by guest or room', async () => {
    mockApi([{ path: '/api/front-desk', body: desk({ in_house: [party({ checked_in_at: '2026-10-28T13:05:00.000Z' }), party({ delegation_id: 'd-2', name: 'Dr Ngozi Eze', rooms: ['104'] })] }) }])
    renderWithApp(<FrontDeskScreen />, deskSession)
    const user = userEvent.setup()
    expect(await screen.findByText('Nobody is arriving on this day.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'In house' }))
    expect(screen.getByText('Cat. 1 · Checked in 14:05')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Find a guest or room' }), '104')

    expect(screen.getByRole('article', { name: 'Dr Ngozi Eze' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Bishop Augustine Okafor' })).not.toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Find a guest or room' }), '9')
    expect(screen.getByText('No guest or room matches.')).toBeInTheDocument()
  })
})
