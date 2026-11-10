import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RoomsBoard } from '@/lib/repositories/rooms-board'
import { mockApi } from '@/tests/support/api-mock'
import { renderWithApp } from '@/tests/support/render'
import { RoomCard } from './RoomCard'
import type { GuestProfile, Member, Stay } from './types'

const member = (overrides: Partial<Member>): Member => ({
  id: 'g-1',
  title: 'Bishop',
  full_name: 'Augustine Okafor',
  member_role: 'principal',
  is_placeholder: false,
  status: 'expected',
  dietary: [],
  accessibility: null,
  category_name: null,
  version: 1,
  ...overrides,
})

const stay = (overrides: Partial<Stay>): Stay => ({
  id: 's-1',
  guest_id: 'g-1',
  status: 'checked_in',
  expected_check_in_at: '2026-10-28T13:00:00Z',
  expected_check_out_at: '2026-10-31T11:00:00Z',
  is_manual_override: false,
  override_reason: null,
  room_id: 'r-412',
  number: '412',
  floor: 4,
  wing: 'East',
  room_type: 'Executive Suite',
  ...overrides,
})

const members = [
  member({}),
  member({ id: 'g-2', title: 'Mrs', full_name: 'Grace Okafor', member_role: 'family' }),
  member({ id: 'g-3', title: null, full_name: 'Chidi Obi', member_role: 'assistant' }),
  member({ id: 'g-4', title: null, full_name: null, member_role: 'security', is_placeholder: true }),
  member({ id: 'g-5', title: null, full_name: 'Musa Danjuma', member_role: 'assistant' }),
]

const profile = (overrides: Partial<GuestProfile> = {}): GuestProfile =>
  ({
    guest: { proximity_priority: 'high', share_group: null },
    members,
    stays: [stay({}), stay({ id: 's-2', guest_id: 'g-2', status: 'planned', is_manual_override: true, room_id: 'r-414', number: '414' })],
    room_suggestions: [
      { id: 'p-1', parent_id: 'plan-1', guest_id: 'g-3', room_number: '416' },
      { id: 'p-2', parent_id: null, guest_id: 'g-5', room_number: null },
    ],
    ...overrides,
  }) as GuestProfile

const board = { rooms: [{ id: 'r-420', number: '420', type_name: 'Standard', wing: 'East', floor: 4, status: 'ready' }] } as unknown as RoomsBoard

describe('RoomCard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("shows each member's room, pending suggestion or lack of one", () => {
    renderWithApp(<RoomCard profile={profile()} timeZone="Africa/Lagos" />)

    expect(screen.getByText(/Executive Suite · East wing, floor 4 · Checked in/)).toBeInTheDocument()
    expect(screen.getByText(/From Wed 28 Oct · placed by hand/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'waiting for approval' }).map((link) => link.getAttribute('href'))).toEqual(['/rooms/plan/plan-1', '/dashboard#approvals'])
    expect(screen.getByText(/Suggested: room \?/)).toBeInTheDocument()
    expect(screen.getByText('Name to follow')).toBeInTheDocument()
    expect(screen.getByText('No room yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Change room' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Assign a room' })).toHaveLength(3)
    expect(screen.getByText('Proximity priority: high.')).toBeInTheDocument()
  })

  it('notes a room-share group and copes with a profile without room access', () => {
    renderWithApp(<RoomCard profile={profile({ stays: undefined, room_suggestions: undefined, guest: { proximity_priority: 'normal', share_group: 'Okafor couple' } as never })} timeZone="Africa/Lagos" />)
    expect(screen.getByText('Proximity priority: normal · shares a room with group “Okafor couple”.')).toBeInTheDocument()
    expect(screen.getAllByText('No room yet')).toHaveLength(5)
  })

  it('opens the room picker for a member once the building has loaded', async () => {
    mockApi([{ path: '/api/rooms/board', body: board }])
    const user = userEvent.setup()
    renderWithApp(<RoomCard profile={profile()} timeZone="Africa/Lagos" />)

    const row = screen.getByText('Name to follow').closest('.profile-room-row') as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Assign a room' }))

    const dialog = await screen.findByRole('dialog', { name: 'Room for Name to follow' })
    expect(within(dialog).getByRole('option', { name: '420 · Standard, East F4' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
