import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BoardRoom, RoomsBoard } from '@/lib/repositories/rooms-board'
import { mockApi, sentBody } from '@/tests/support/api-mock'
import { renderWithApp } from '@/tests/support/render'
import { RoomsScreen } from './RoomsScreen'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/rooms' }))

const room = (overrides: Partial<BoardRoom>): BoardRoom => ({
  id: 'r-101',
  number: '101',
  floor: 1,
  wing: 'West',
  position: 1,
  type_name: 'Standard',
  tier: 1,
  capacity: 2,
  is_accessible: false,
  status: 'ready',
  stays: [],
  suggestions: [],
  ...overrides,
})

const reserved = room({
  id: 'r-301',
  number: '301',
  floor: 3,
  type_name: 'Suite',
  tier: 3,
  status: 'reserved',
  stays: [
    {
      assignment_id: 'a-1',
      guest_id: 'g-1',
      name: 'Bishop Augustine Okafor',
      role: 'Principal',
      delegation_name: 'Okafor delegation',
      principal_guest_id: 'g-1',
      status: 'planned',
      check_in: '2026-10-28T13:00:00.000Z',
      check_out: '2026-10-31T11:00:00.000Z',
      is_manual_override: false,
    },
  ],
})

const board: RoomsBoard = {
  rooms: [room({}), room({ id: 'r-104', number: '104', wing: 'East', position: 4, status: 'needs-cleaning' }), reserved],
  counts: { ready: 1, proposed: 0, reserved: 1, occupied: 0, 'needs-cleaning': 1, cleaning: 0, 'out-of-service': 0 },
  pending_plan_id: null,
  unplaced: 2,
}

describe('RoomsScreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    push.mockReset()
  })

  it('shows the building, then a room in the inspector with Move guest', async () => {
    mockApi([{ path: '/api/rooms/board', body: board }])
    renderWithApp(<RoomsScreen />)

    expect(await screen.findByText('3 rooms · 1 ready · 2 guests need a room')).toBeInTheDocument()
    expect(screen.getByText('Select a room to see details.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'East wing' })).toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Room 301, Reserved' }))

    expect(screen.getByRole('heading', { name: 'Room 301' })).toBeInTheDocument()
    expect(screen.getByText(/Reserved for Bishop Augustine Okafor, from/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move guest' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View guest' })).toHaveAttribute('href', '/guests/g-1')
  })

  it('fades rooms that do not match a status tile', async () => {
    mockApi([{ path: '/api/rooms/board', body: board }])
    renderWithApp(<RoomsScreen />)
    const tile = await screen.findByRole('button', { name: 'Room 101, Ready' })

    await userEvent.setup().click(screen.getByRole('button', { name: /^1\s*Needs cleaning$/ }))

    expect(tile).toHaveClass('is-faded')
    expect(screen.getByRole('button', { name: 'Room 104, Needs cleaning' })).not.toHaveClass('is-faded')
  })

  it('runs the allocator and opens the drafted plan', async () => {
    const fetchMock = mockApi([
      { path: '/api/rooms/board', body: board },
      { path: '/api/allocation/run', method: 'POST', body: { proposal_id: 'plan-1' } },
    ])
    renderWithApp(<RoomsScreen />)
    await screen.findByText(/3 rooms/)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Run allocator' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/rooms/plan/plan-1'))
    expect(fetchMock.mock.calls.some(([url, init]) => String(url) === '/api/allocation/run' && init?.method === 'POST')).toBe(true)
  })

  it('says so when every guest already has a room', async () => {
    mockApi([
      { path: '/api/rooms/board', body: { ...board, unplaced: 0 } },
      { path: '/api/allocation/run', method: 'POST', status: 409, body: { code: 'nothing_to_plan', message: 'Nothing to plan' } },
    ])
    renderWithApp(<RoomsScreen />)
    await screen.findByText('3 rooms · 1 ready')

    await userEvent.setup().click(screen.getByRole('button', { name: 'Run allocator' }))

    expect(await screen.findByText('Every guest already has a room or a suggestion.')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('moves a guest by hand, asking for a reason when a rule breaks', async () => {
    const fetchMock = mockApi([
      { path: '/api/rooms/board', body: board },
      {
        path: '/api/room-assignments/check',
        method: 'POST',
        body: {
          guest: { id: 'g-1', name: 'Bishop Augustine Okafor', role: 'Principal', delegation: 'Okafor delegation' },
          from_room: { id: 'r-301', number: '301', type: 'Suite', wing: 'West', floor: 3, is_accessible: false },
          to_room: { id: 'r-104', number: '104', type: 'Standard', wing: 'East', floor: 1, is_accessible: false },
          violations: [{ code: 'not_ready', text: 'Room 104 cannot be cleaned before the guest arrives.' }],
          losses: [{ code: 'tier', before: 'met', after: 'missed', text: 'A standard room instead of a suite.' }],
          scores: { before: 1, after: 0.4 },
          needs_confirmation: true,
        },
      },
      { path: '/api/room-assignments', method: 'POST', status: 201, body: { room_number: '104' } },
    ])
    renderWithApp(<RoomsScreen />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Room 301, Reserved' }))
    await user.click(screen.getByRole('button', { name: 'Move guest' }))
    const dialog = screen.getByRole('dialog')

    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Room' }), 'r-104')

    expect(await within(dialog).findByRole('heading', { name: 'This move breaks 1 rule' })).toBeInTheDocument()
    expect(within(dialog).getByText('Room 104 cannot be cleaned before the guest arrives.')).toBeInTheDocument()
    const assign = within(dialog).getByRole('button', { name: 'Assign anyway' })
    expect(assign).toBeDisabled()

    await user.type(within(dialog).getByRole('textbox'), 'Principal asked for the east wing')
    await user.click(assign)

    expect(await screen.findByText('Room 104 assigned. Reason saved in Activity.')).toBeInTheDocument()
    const index = fetchMock.mock.calls.findIndex(([url, init]) => String(url) === '/api/room-assignments' && init?.method === 'POST')
    expect(sentBody(fetchMock, index)).toEqual({ guest_id: 'g-1', room_id: 'r-104', reason: 'Principal asked for the east wing', acknowledged: ['not_ready', 'tier'] })
  })
})
