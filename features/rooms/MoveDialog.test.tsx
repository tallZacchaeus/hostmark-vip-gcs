import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MoveCheck } from '@/lib/services/rooms/check'
import { mockApi, type MockRoute } from '@/tests/support/api-mock'
import { requestsTo } from '@/tests/support/fetch-calls'
import { renderWithApp } from '@/tests/support/render'
import { MoveDialog, type RoomChoice, roomChoices } from './MoveDialog'

const guest = { id: 'g-2', name: 'Dr Ngozi Eze' }
const rooms: RoomChoice[] = [
  { id: 'r-104', number: '104', label: 'Standard, East F1' },
  { id: 'r-412', number: '412', label: 'Executive Suite, East F4' },
]

const check = (overrides: Partial<MoveCheck> = {}): MoveCheck => ({
  guest: { id: 'g-2', name: 'Dr Ngozi Eze', role: 'Principal', delegation: 'Eze party' },
  from_room: null,
  to_room: { id: 'r-412', number: '412', type: 'Executive Suite', wing: 'East', floor: 4, is_accessible: true },
  violations: [],
  losses: [],
  score_before: null,
  score_after: 0.9,
  needs_confirmation: false,
  ...overrides,
})

const fromRoom = { id: 'r-301', number: '301', type: 'Suite', wing: 'West', floor: 3, is_accessible: false }

function open(routes: MockRoute[]) {
  const fetchMock = mockApi(routes)
  const onClose = vi.fn()
  const user = userEvent.setup()
  renderWithApp(<MoveDialog guest={guest} rooms={rooms} onClose={onClose} />)
  return { fetchMock, onClose, user, dialog: screen.getByRole('dialog') }
}

const checkRoute = (body: MoveCheck): MockRoute => ({ path: '/api/room-assignments/check', method: 'POST', body })
const assignRoute: MockRoute = { path: '/api/room-assignments', method: 'POST', status: 201, body: { room_number: '412' } }

describe('MoveDialog', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('waits for a room before anything can be assigned', () => {
    const { dialog } = open([])
    expect(within(dialog).getByRole('heading', { name: 'Room for Dr Ngozi Eze' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Assign' })).toBeDisabled()
    expect(within(dialog).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Choose a room',
      '104 · Standard, East F1',
      '412 · Executive Suite, East F4',
    ])
  })

  it('assigns a first room in one tap when nothing is lost', async () => {
    const { fetchMock, onClose, user, dialog } = open([checkRoute(check()), assignRoute])

    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Room' }), 'r-412')

    expect(await within(dialog).findByRole('heading', { name: 'Assign room 412?' })).toBeInTheDocument()
    expect(within(dialog).getByText('No room yet')).toBeInTheDocument()
    expect(within(dialog).getByText('Executive Suite, accessible')).toBeInTheDocument()
    expect(dialog.querySelector('.move-story')).toHaveTextContent('Assign Dr Ngozi Eze (principal, Eze party) to room 412.')
    expect(requestsTo(fetchMock, 'POST', '/api/room-assignments/check')[0]?.body).toEqual({ guest_id: 'g-2', room_id: 'r-412' })

    await user.click(within(dialog).getByRole('button', { name: 'Assign' }))

    expect(await screen.findByText('Dr Ngozi Eze is now in room 412.')).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'POST', '/api/room-assignments')[1]?.body).toEqual({ guest_id: 'g-2', room_id: 'r-412', reason: null, acknowledged: [] })
    expect(onClose).toHaveBeenCalled()
  })

  it('moves a guest from their current room', async () => {
    const { user, dialog } = open([checkRoute(check({ from_room: fromRoom, to_room: { ...check().to_room, is_accessible: false } }))])
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Room' }), 'r-412')

    expect(await within(dialog).findByRole('heading', { name: 'Move to room 412?' })).toBeInTheDocument()
    expect(dialog.querySelector('.move-story')).toHaveTextContent('Move Dr Ngozi Eze (principal, Eze party) from room 301 to room 412.')
    expect(within(dialog).getByText('West wing · F3')).toBeInTheDocument()
  })

  it('lists every preference the move gives up', async () => {
    const losses: MoveCheck['losses'] = [
      { code: 'proximity', before: 'met', after: 'partly', text: 'Two floors from the principal.' },
      { code: 'accessible', before: 'met', after: 'missed', text: 'The room has no step-free access.' },
      { code: 'ground_floor', before: null, after: 'missed', text: 'Floor 4 instead of the ground floor.' },
    ] as never
    const { fetchMock, user, dialog } = open([checkRoute(check({ from_room: fromRoom, losses })), assignRoute])
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Room' }), 'r-412')

    expect(await within(dialog).findByRole('heading', { name: 'This move loses 3 preferences' })).toBeInTheDocument()
    expect(within(dialog).getByText('WHAT YOU LOSE')).toBeInTheDocument()
    expect(within(dialog).getByText('Proximity to the principal')).toBeInTheDocument()
    expect(within(dialog).getByText('Accessible room')).toBeInTheDocument()
    expect(within(dialog).getByText('Ground floor')).toBeInTheDocument()
    expect(within(dialog).getByText('Partial')).toBeInTheDocument()
    expect(within(dialog).getAllByText('Low')).toHaveLength(2)

    await user.click(within(dialog).getByRole('button', { name: 'Assign' }))
    await screen.findByText('Dr Ngozi Eze is now in room 412.')
    expect(requestsTo(fetchMock, 'POST', '/api/room-assignments')[1]?.body).toMatchObject({ acknowledged: ['proximity', 'accessible', 'ground_floor'] })
  })

  it('names a single lost preference and several broken rules', async () => {
    const { user, dialog } = open([checkRoute(check({ losses: [{ code: 'tier', before: 'met', after: 'partly', text: 'One tier lower.' }] as never }))])
    const select = within(dialog).getByRole('combobox', { name: 'Room' })
    await user.selectOptions(select, 'r-412')
    expect(await within(dialog).findByRole('heading', { name: 'This move loses a preference' })).toBeInTheDocument()
    expect(within(dialog).getByText('Room tier')).toBeInTheDocument()

    mockApi([
      checkRoute(
        check({
          violations: [
            { code: 'not_ready', text: 'Room 104 is not clean in time.' },
            { code: 'capacity', text: 'Room 104 sleeps fewer people.' },
          ] as never,
          needs_confirmation: true,
        }),
      ),
    ])
    await user.selectOptions(select, 'r-104')
    expect(await within(dialog).findByRole('heading', { name: 'This move breaks 2 rules' })).toBeInTheDocument()
    expect(within(dialog).getByText('BROKEN RULES')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Assign anyway' })).toBeDisabled()
  })

  it('clears the check when the room choice is cleared', async () => {
    const { fetchMock, user, dialog } = open([checkRoute(check())])
    const select = within(dialog).getByRole('combobox', { name: 'Room' })
    await user.selectOptions(select, 'r-412')
    await within(dialog).findByRole('heading', { name: 'Assign room 412?' })

    await user.selectOptions(select, '')
    expect(within(dialog).getByRole('heading', { name: 'Room for Dr Ngozi Eze' })).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'POST', '/api/room-assignments/check')).toHaveLength(1)
  })

  it('shows why a room cannot be checked', async () => {
    const { user, dialog } = open([
      { path: '/api/room-assignments/check', method: 'POST', status: 409, body: { code: 'same_room', message: 'The guest is already in this room' } },
    ])
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Room' }), 'r-412')
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The guest is already in this room')
  })

  it('checks again when the room changed since the check, and asks for confirmation', async () => {
    const { fetchMock, onClose, user, dialog } = open([
      checkRoute(check()),
      { path: '/api/room-assignments', method: 'POST', status: 409, body: { code: 'needs_confirmation', message: 'Something changed; review the warnings' } },
    ])
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Room' }), 'r-412')
    await within(dialog).findByRole('heading', { name: 'Assign room 412?' })

    await user.click(within(dialog).getByRole('button', { name: 'Assign' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Something changed; review the warnings')
    expect(requestsTo(fetchMock, 'POST', '/api/room-assignments/check')).toHaveLength(2)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('checks a pre-selected room straight away, so it can be assigned without picking it again', async () => {
    const fetchMock = mockApi([checkRoute(check()), assignRoute])
    renderWithApp(<MoveDialog guest={guest} rooms={rooms} initialRoomId="r-412" onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog')

    expect(within(dialog).getByRole('combobox', { name: 'Room' })).toHaveValue('r-412')
    expect(await within(dialog).findByRole('heading', { name: 'Assign room 412?' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Assign' })).toBeEnabled()
    expect(requestsTo(fetchMock, 'POST', '/api/room-assignments/check')).toHaveLength(1)
    expect(requestsTo(fetchMock, 'POST', '/api/room-assignments/check')[0]?.body).toEqual({ guest_id: 'g-2', room_id: 'r-412' })
  })

  it('shows the warnings for a pre-selected room that breaks a rule', async () => {
    mockApi([checkRoute(check({ violations: [{ code: 'not_ready', text: 'Room 412 is not clean in time.' }] as never, needs_confirmation: true }))])
    renderWithApp(<MoveDialog guest={guest} rooms={rooms} initialRoomId="r-412" onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog')

    expect(await within(dialog).findByRole('heading', { name: 'This move breaks 1 rule' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Assign anyway' })).toBeDisabled()
  })

  it('closes from Cancel and the close button', async () => {
    const { onClose, user, dialog } = open([])
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe('roomChoices', () => {
  it('orders rooms by number and notes any room that is not ready', () => {
    const choices = roomChoices([
      { id: 'r-1010', number: '1010', type_name: 'Suite', wing: 'North', floor: 10, status: 'ready' },
      { id: 'r-104', number: '104', type_name: 'Standard', wing: 'East', floor: 1, status: 'needs-cleaning' },
      { id: 'r-99', number: '99', type_name: 'Standard', wing: 'East', floor: 0, status: 'ready' },
    ])
    expect(choices).toEqual([
      { id: 'r-99', number: '99', label: 'Standard, East F0' },
      { id: 'r-104', number: '104', label: 'Standard, East F1 (needs cleaning)' },
      { id: 'r-1010', number: '1010', label: 'Suite, North F10' },
    ])
  })
})
