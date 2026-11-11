import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, type MockRoute } from '@/tests/support/api-mock'
import { requestsTo } from '@/tests/support/fetch-calls'
import { renderWithApp, sessionFor } from '@/tests/support/render'
import { RoomsTab } from './RoomsTab'
import type { Room, RoomType } from './types'

const suite: RoomType = { id: 't-1', name: 'Executive Suite', tier: 1, default_capacity: 2, cleaning_minutes: 60 }
const standard: RoomType = { id: 't-2', name: 'Standard', tier: 3, default_capacity: 2, cleaning_minutes: 40 }

const room = (overrides: Partial<Room>): Room => ({
  id: 'r-412',
  number: '412',
  floor: 4,
  wing: 'East',
  position: 12,
  room_type_id: 't-1',
  capacity: 2,
  is_accessible: false,
  out_of_service: false,
  housekeeping_status: 'clean',
  notes: null,
  ...overrides,
})

const rooms = [
  room({ is_accessible: true }),
  room({ id: 'r-104', number: '104', floor: 1, wing: 'West', room_type_id: 't-2', housekeeping_status: 'needs_cleaning' }),
  room({ id: 'r-105', number: '105', floor: 1, wing: 'West', room_type_id: 't-2', housekeeping_status: 'cleaning' }),
  room({ id: 'r-106', number: '106', floor: 1, wing: 'Garden', room_type_id: 't-gone', out_of_service: true }),
]

function routes(overrides: { types?: unknown; rooms?: unknown; total?: number } = {}, extra: readonly MockRoute[] = []): MockRoute[] {
  return [
    ...extra,
    { path: '/api/admin/room-types', body: overrides.types ?? [suite, standard] },
    { path: '/api/admin/rooms', body: overrides.rooms ?? rooms, meta: { total: overrides.total ?? 4, page: 1, limit: 200 } },
  ]
}

function rowOf(text: string, section = 'Rooms'): HTMLElement {
  const row = within(screen.getByRole('region', { name: section })).getByText(text).closest('tr')
  if (!row) throw new Error(`No row for ${text}`)
  return row
}

async function setNumber(user: ReturnType<typeof userEvent.setup>, field: HTMLElement, value: string) {
  await user.clear(field)
  await user.type(field, value)
}

describe('RoomsTab', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists room types and rooms with their type, accessibility and housekeeping status', async () => {
    mockApi(routes())
    renderWithApp(<RoomsTab />, sessionFor('admin'))

    expect(await screen.findByText('4 rooms')).toBeInTheDocument()
    expect(within(rowOf('Standard', 'Room types')).getByText('40')).toBeInTheDocument()
    expect(within(rowOf('412')).getByText('Executive Suite')).toBeInTheDocument()
    expect(within(rowOf('412')).getByText('(accessible)')).toBeInTheDocument()
    expect(within(rowOf('412')).getByText('Clean')).toBeInTheDocument()
    expect(within(rowOf('104')).getByText('Needs cleaning')).toBeInTheDocument()
    expect(within(rowOf('105')).getByText('Cleaning')).toBeInTheDocument()
    expect(within(rowOf('106')).getByText('Out of service')).toBeInTheDocument()
    expect(within(rowOf('106')).getByText('—')).toBeInTheDocument()
    expect(within(screen.getByRole('combobox', { name: 'Filter by wing' })).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'All wings',
      'East',
      'Garden',
      'West',
    ])
  })

  it('notes when only part of a large venue is shown', async () => {
    mockApi(routes({ total: 250 }))
    renderWithApp(<RoomsTab />, sessionFor('admin'))
    expect(await screen.findByText('Showing 200 of 250. Filter by floor or wing to see the rest.')).toBeInTheDocument()
  })

  it('filters rooms by floor and wing through the API', async () => {
    const fetchMock = mockApi(routes())
    const user = userEvent.setup()
    renderWithApp(<RoomsTab />, sessionFor('admin'))
    await screen.findByText('4 rooms')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by floor' }), '1')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by wing' }), 'West')

    await waitFor(() =>
      expect(requestsTo(fetchMock, 'GET', '/api/admin/rooms').map((request) => request.url)).toContain('/api/admin/rooms?limit=200&floor=1&wing=West'),
    )
  })

  it('cannot add a room before any room type exists, and shows load failures', async () => {
    mockApi([
      { path: '/api/admin/room-types', body: { code: 'internal_error', message: 'Room types are unavailable' }, status: 500 },
      { path: '/api/admin/rooms', body: { code: 'internal_error', message: 'Rooms are unavailable' }, status: 500 },
    ])
    renderWithApp(<RoomsTab />, sessionFor('admin'))

    expect(await screen.findByText('Room types are unavailable')).toBeInTheDocument()
    expect(await screen.findByText('Rooms are unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add room' })).toBeDisabled()
  })

  it('adds a room type with the default tier, capacity and cleaning time', async () => {
    const fetchMock = mockApi(routes({}, [{ path: '/api/admin/room-types', method: 'POST', body: { id: 't-3' }, status: 201 }]))
    const user = userEvent.setup()
    renderWithApp(<RoomsTab />, sessionFor('admin'))
    await screen.findByText('4 rooms')

    await user.click(screen.getByRole('button', { name: 'Add room type' }))
    const dialog = screen.getByRole('dialog', { name: 'Add room type' })
    const submit = within(dialog).getByRole('button', { name: 'Add room type' })
    await user.click(submit)
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter a name')
    await user.type(within(dialog).getByLabelText(/^Name/), ' Junior Suite ')
    await setNumber(user, within(dialog).getByLabelText(/^Cleaning time/), '50')
    await user.click(submit)

    expect(await screen.findByText('Room type saved.')).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'POST', '/api/admin/room-types')[0]?.body).toEqual({ name: 'Junior Suite', tier: 1, default_capacity: 2, cleaning_minutes: 50 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('edits a room type starting from its saved values', async () => {
    const fetchMock = mockApi(routes({}, [{ path: '/api/admin/room-types/t-2', method: 'PATCH', body: standard }]))
    const user = userEvent.setup()
    renderWithApp(<RoomsTab />, sessionFor('admin'))
    await screen.findByText('4 rooms')

    await user.click(screen.getByRole('button', { name: 'Edit Standard' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit room type' })
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue('Standard')
    await setNumber(user, within(dialog).getByLabelText(/^Tier/), '2')
    await setNumber(user, within(dialog).getByLabelText(/^Default capacity/), '3')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await screen.findByText('Room type saved.')
    expect(requestsTo(fetchMock, 'PATCH', '/api/admin/room-types/t-2')[0]?.body).toEqual({ name: 'Standard', tier: 2, default_capacity: 3, cleaning_minutes: 40 })
  })

  it('adds a room that uses its type default capacity when none is given', async () => {
    const fetchMock = mockApi(routes({}, [{ path: '/api/admin/rooms', method: 'POST', body: { id: 'r-9' }, status: 201 }]))
    const user = userEvent.setup()
    renderWithApp(<RoomsTab />, sessionFor('admin'))
    await screen.findByText('4 rooms')

    await user.click(screen.getByRole('button', { name: 'Add room' }))
    const dialog = screen.getByRole('dialog', { name: 'Add room' })
    const submit = within(dialog).getByRole('button', { name: 'Add room' })
    await user.type(within(dialog).getByLabelText(/^Room number/), '501')
    await user.click(submit)
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter the wing')
    expect(within(dialog).getByRole('alert')).not.toHaveTextContent('Enter the room number')
    await user.type(within(dialog).getByLabelText(/^Wing/), 'North')
    await setNumber(user, within(dialog).getByLabelText(/^Floor/), '5')
    await user.clear(within(dialog).getByLabelText(/^Position/))
    await user.selectOptions(within(dialog).getByLabelText(/^Room type/), 't-2')
    await user.click(within(dialog).getByLabelText('Accessible room'))
    await user.type(within(dialog).getByLabelText('Notes'), 'Near the lift')
    await user.click(submit)

    expect(await screen.findByText('Room saved.')).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'POST', '/api/admin/rooms')[0]?.body).toEqual({
      number: '501',
      floor: 5,
      wing: 'North',
      position: 0,
      room_type_id: 't-2',
      is_accessible: true,
      out_of_service: false,
      notes: 'Near the lift',
    })
  })

  it('edits a room, keeping its capacity and taking it out of service', async () => {
    const fetchMock = mockApi(routes({}, [{ path: '/api/admin/rooms/r-412', method: 'PATCH', body: rooms[0] }]))
    const user = userEvent.setup()
    renderWithApp(<RoomsTab />, sessionFor('admin'))
    await screen.findByText('4 rooms')

    await user.click(screen.getByRole('button', { name: 'Edit room 412' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit room 412' })
    await user.click(within(dialog).getByLabelText('Out of service (the allocator will not use it)'))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await screen.findByText('Room saved.')
    expect(requestsTo(fetchMock, 'PATCH', '/api/admin/rooms/r-412')[0]?.body).toEqual({
      number: '412',
      floor: 4,
      wing: 'East',
      position: 12,
      room_type_id: 't-1',
      capacity: 2,
      is_accessible: true,
      out_of_service: true,
      notes: '',
    })
  })

  it('deletes a room after confirmation', async () => {
    const fetchMock = mockApi(routes({}, [{ path: '/api/admin/rooms/r-104', method: 'DELETE', body: { id: 'r-104' } }]))
    const user = userEvent.setup()
    renderWithApp(<RoomsTab />, sessionFor('admin'))
    await screen.findByText('4 rooms')

    await user.click(screen.getByRole('button', { name: 'Delete room 104' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete room 104?' })
    expect(within(dialog).getByText(/Records that are still in use cannot be deleted/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Deleted.')).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'DELETE', '/api/admin/rooms/r-104')).toHaveLength(1)
  })

  it('explains when a room type in use cannot be deleted', async () => {
    mockApi(
      routes({}, [
        { path: '/api/admin/room-types/t-1', method: 'DELETE', body: { code: 'conflict', message: 'Rooms still use this room type' }, status: 409 },
      ]),
    )
    const user = userEvent.setup()
    renderWithApp(<RoomsTab />, sessionFor('admin'))
    await screen.findByText('4 rooms')

    await user.click(screen.getByRole('button', { name: 'Delete Executive Suite' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete room type Executive Suite?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Rooms still use this room type')
  })
})

describe('Room CSV import', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const csv = 'Number,Floor,Wing,Position,Room Type,Capacity,Accessible,Out of service,Notes\n601,6,East,1,Standard,2,no,no,'
  const summary = { rows: 3, created: 2, updated: 1, dry_run: true }

  it('checks the file first, then imports it and reports what changed', async () => {
    const fetchMock = mockApi(routes({}, [{ path: '/api/admin/rooms/import', method: 'POST', body: summary }]))
    const user = userEvent.setup()
    renderWithApp(<RoomsTab />, sessionFor('admin'))
    await screen.findByText('4 rooms')

    await user.click(screen.getByRole('button', { name: 'Import CSV' }))
    const dialog = screen.getByRole('dialog', { name: 'Import rooms from CSV' })
    await user.click(within(dialog).getByRole('button', { name: 'Check file' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Paste the CSV or choose a file')

    const file = new File([csv], 'rooms.csv', { type: 'text/csv' })
    await user.upload(within(dialog).getByLabelText('CSV file'), file)
    await waitFor(() => expect(within(dialog).getByLabelText('Or paste the CSV')).toHaveValue(csv))
    await user.click(within(dialog).getByRole('button', { name: 'Check file' }))

    expect(await within(dialog).findByRole('status')).toHaveTextContent('Check passed: 3 rows, 2 new rooms, 1 updated.')
    const [check] = requestsTo(fetchMock, 'POST', '/api/admin/rooms/import')
    expect(check?.url).toBe('/api/admin/rooms/import?dry_run=true')
    expect(check?.body).toBe(csv)

    await user.click(within(dialog).getByRole('button', { name: 'Import 3 rooms' }))
    expect(await screen.findByText('Imported 3 rooms: 2 new, 1 updated.')).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'POST', '/api/admin/rooms/import').map((request) => request.url)).toEqual([
      '/api/admin/rooms/import?dry_run=true',
      '/api/admin/rooms/import',
    ])
  })

  it('asks for a new check after the pasted CSV changes, and shows file problems', async () => {
    const problem = { code: 'validation_failed', message: 'Line 2 has an unknown room type', details: [{ path: 'line_2', message: 'Unknown room type "Penthouse"' }] }
    mockApi(routes({}, [{ path: '/api/admin/rooms/import', method: 'POST', body: summary }]))
    const user = userEvent.setup()
    renderWithApp(<RoomsTab />, sessionFor('admin'))
    await screen.findByText('4 rooms')

    await user.click(screen.getByRole('button', { name: 'Import CSV' }))
    const dialog = screen.getByRole('dialog', { name: 'Import rooms from CSV' })
    const textarea = within(dialog).getByLabelText('Or paste the CSV')
    await user.click(textarea)
    await user.paste(csv)
    await user.click(within(dialog).getByRole('button', { name: 'Check file' }))
    await within(dialog).findByRole('button', { name: 'Import 3 rooms' })

    await user.type(textarea, 'x')
    expect(within(dialog).getByRole('button', { name: 'Check file' })).toBeInTheDocument()

    mockApi(routes({}, [{ path: '/api/admin/rooms/import', method: 'POST', body: problem, status: 400 }]))
    await user.click(within(dialog).getByRole('button', { name: 'Check file' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Line 2: Unknown room type "Penthouse"')
  })
})
