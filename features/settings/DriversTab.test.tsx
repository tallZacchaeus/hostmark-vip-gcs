import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, type MockRoute } from '@/tests/support/api-mock'
import { requestsTo } from '@/tests/support/fetch-calls'
import { renderWithApp, sessionFor } from '@/tests/support/render'
import { DriversTab } from './DriversTab'
import type { Account, Driver, DriverShift } from './types'

const musa: Driver = {
  id: 'd-1',
  profile_id: 'a-3',
  full_name: 'Musa Bello',
  phone: '+2348011111111',
  vehicle_label: 'Prado SUV',
  vehicle_capacity: 6,
  is_active: true,
}
const chidi: Driver = { id: 'd-2', profile_id: null, full_name: 'Chidi Okeke', phone: null, vehicle_label: null, vehicle_capacity: 4, is_active: false }

const driverLogin: Account = {
  id: 'a-3',
  full_name: 'Musa Bello',
  email: 'musa@example.com',
  role: 'driver',
  phone: null,
  active: true,
  deactivation_reason: null,
  must_change_password: false,
  created_at: '2026-10-20T09:00:00Z',
}

// 06:00–14:00 on 28 Oct, and 22:00 on 29 Oct to 06:00 the next morning (Lagos is UTC+1).
const shifts: DriverShift[] = [
  { id: 's-1', driver_id: 'd-1', starts_at: '2026-10-28T05:00:00.000Z', ends_at: '2026-10-28T13:00:00.000Z' },
  { id: 's-2', driver_id: 'd-1', starts_at: '2026-10-29T21:00:00.000Z', ends_at: '2026-10-30T05:00:00.000Z' },
]

function routes(extra: readonly MockRoute[] = [], drivers: unknown = [musa, chidi]): MockRoute[] {
  return [
    ...extra,
    { path: '/api/admin/drivers', body: drivers, meta: { total: 2, page: 1, limit: 200 } },
    { path: '/api/admin/users', body: [driverLogin] },
    { path: '/api/admin/driver-shifts', body: shifts },
  ]
}

function rowOf(name: string): HTMLElement {
  const row = screen.getByText(name).closest('tr')
  if (!row) throw new Error(`No row for ${name}`)
  return row
}

describe('DriversTab', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists drivers with vehicle, seats, app login and availability', async () => {
    mockApi(routes())
    renderWithApp(<DriversTab />, sessionFor('admin'))

    expect(await screen.findByText('2 drivers')).toBeInTheDocument()
    const musaRow = within(rowOf('Musa Bello'))
    expect(musaRow.getByText('+2348011111111')).toBeInTheDocument()
    expect(musaRow.getByText('Prado SUV')).toBeInTheDocument()
    expect(musaRow.getByText('Linked')).toBeInTheDocument()
    expect(musaRow.getByText('Available')).toBeInTheDocument()
    const chidiRow = within(rowOf('Chidi Okeke'))
    expect(chidiRow.getAllByText('—')).toHaveLength(3)
    expect(chidiRow.getByText('Inactive')).toBeInTheDocument()
  })

  it('shows a load failure with Retry', async () => {
    mockApi([{ path: '/api/admin/drivers', body: { code: 'internal_error', message: 'Drivers are unavailable' }, status: 500 }])
    renderWithApp(<DriversTab />, sessionFor('admin'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Drivers are unavailable')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('adds a driver linked to a driver-app login', async () => {
    const fetchMock = mockApi(routes([{ path: '/api/admin/drivers', method: 'POST', body: { id: 'd-3' }, status: 201 }]))
    const user = userEvent.setup()
    renderWithApp(<DriversTab />, sessionFor('admin'))
    await screen.findByText('2 drivers')

    await user.click(screen.getByRole('button', { name: 'Add driver' }))
    const dialog = screen.getByRole('dialog', { name: 'Add driver' })
    const submit = within(dialog).getByRole('button', { name: 'Add driver' })
    await user.click(submit)
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter the driver’s name')
    await user.type(within(dialog).getByLabelText(/^Name/), ' Emeka Obi ')
    await user.type(within(dialog).getByLabelText(/^Phone/), '+234 802 222 2222')
    await user.type(within(dialog).getByLabelText('Vehicle'), 'Hiace bus')
    await user.clear(within(dialog).getByLabelText('Seats for passengers'))
    await user.type(within(dialog).getByLabelText('Seats for passengers'), '12')
    await within(dialog).findByRole('option', { name: 'Musa Bello · musa@example.com' })
    await user.selectOptions(within(dialog).getByLabelText(/^Login for the driver app/), 'a-3')
    await user.click(submit)

    expect(await screen.findByText('Driver saved.')).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'POST', '/api/admin/drivers')[0]?.body).toEqual({
      full_name: 'Emeka Obi',
      vehicle_label: 'Hiace bus',
      vehicle_capacity: 12,
      is_active: true,
      profile_id: 'a-3',
      phone: '+2348022222222',
    })
  })

  it('leaves the phone out of a new driver without one', async () => {
    const fetchMock = mockApi(routes([{ path: '/api/admin/drivers', method: 'POST', body: { id: 'd-3' }, status: 201 }]))
    const user = userEvent.setup()
    renderWithApp(<DriversTab />, sessionFor('admin'))
    await screen.findByText('2 drivers')

    await user.click(screen.getByRole('button', { name: 'Add driver' }))
    const dialog = screen.getByRole('dialog', { name: 'Add driver' })
    await user.type(within(dialog).getByLabelText(/^Name/), 'Emeka Obi')
    await user.click(within(dialog).getByRole('button', { name: 'Add driver' }))

    await screen.findByText('Driver saved.')
    expect(requestsTo(fetchMock, 'POST', '/api/admin/drivers')[0]?.body).toEqual({
      full_name: 'Emeka Obi',
      vehicle_label: '',
      vehicle_capacity: 4,
      is_active: true,
      profile_id: null,
    })
  })

  it('edits a driver: clearing the phone and login and marking them unavailable', async () => {
    const fetchMock = mockApi(routes([{ path: '/api/admin/drivers/d-1', method: 'PATCH', body: musa }]))
    const user = userEvent.setup()
    renderWithApp(<DriversTab />, sessionFor('admin'))
    await screen.findByText('2 drivers')

    await user.click(screen.getByRole('button', { name: 'Edit Musa Bello' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Musa Bello' })
    expect(within(dialog).getByLabelText('Vehicle')).toHaveValue('Prado SUV')
    await user.clear(within(dialog).getByLabelText(/^Phone/))
    await user.selectOptions(within(dialog).getByLabelText(/^Login for the driver app/), '')
    await user.click(within(dialog).getByLabelText('Available for pickups'))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await screen.findByText('Driver saved.')
    expect(requestsTo(fetchMock, 'PATCH', '/api/admin/drivers/d-1')[0]?.body).toEqual({
      full_name: 'Musa Bello',
      vehicle_label: 'Prado SUV',
      vehicle_capacity: 6,
      is_active: false,
      profile_id: null,
      phone: null,
    })
  })

  it('deletes a driver after confirmation', async () => {
    const fetchMock = mockApi(routes([{ path: '/api/admin/drivers/d-2', method: 'DELETE', body: { id: 'd-2' } }]))
    const user = userEvent.setup()
    renderWithApp(<DriversTab />, sessionFor('admin'))
    await screen.findByText('2 drivers')

    await user.click(screen.getByRole('button', { name: 'Delete Chidi Okeke' }))
    await user.click(within(screen.getByRole('alertdialog', { name: 'Delete Chidi Okeke?' })).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Chidi Okeke was deleted.')).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'DELETE', '/api/admin/drivers/d-2')).toHaveLength(1)
  })
})

describe('Driver shifts', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function openShifts(fetchRoutes: MockRoute[]) {
    const fetchMock = mockApi(fetchRoutes)
    const user = userEvent.setup()
    renderWithApp(<DriversTab />, sessionFor('admin'))
    await screen.findByText('2 drivers')
    await user.click(within(rowOf('Musa Bello')).getByRole('button', { name: 'Shifts' }))
    return { fetchMock, user, dialog: screen.getByRole('dialog', { name: 'Shifts for Musa Bello' }) }
  }

  it('lists shifts in the event time zone and marks ones that end the next day', async () => {
    const { fetchMock, dialog } = await openShifts(routes())

    expect(within(dialog).getByText(/Times are in the event time zone \(Africa\/Lagos\)/)).toBeInTheDocument()
    const items = await within(dialog).findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Wed 28 Oct 06:00–14:00')
    expect(items[0]).not.toHaveTextContent('(next day)')
    expect(items[1]).toHaveTextContent('Thu 29 Oct 22:00–06:00 (next day)')
    expect(requestsTo(fetchMock, 'GET', '/api/admin/driver-shifts')[0]?.url).toBe('/api/admin/driver-shifts?driver_id=d-1&limit=200')

    const dayOptions = within(within(dialog).getByLabelText(/^Day/)).getAllByRole('option')
    expect(dayOptions.map((option) => option.getAttribute('value'))).toEqual(['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
    expect(within(dialog).getByLabelText(/^Day/)).toHaveValue('2026-10-28')
  })

  it('says when a driver has no shifts yet', async () => {
    const { dialog } = await openShifts([{ path: '/api/admin/driver-shifts', body: [] }, ...routes()])
    expect(await within(dialog).findByText('No shifts yet.')).toBeInTheDocument()
  })

  it('adds a shift, treating an end before the start as running past midnight', async () => {
    const { fetchMock, user, dialog } = await openShifts(routes([{ path: '/api/admin/driver-shifts', method: 'POST', body: { id: 's-3' }, status: 201 }]))

    await user.selectOptions(within(dialog).getByLabelText(/^Day/), '2026-10-30')
    fireEvent.change(within(dialog).getByLabelText('Starts'), { target: { value: '22:00' } })
    fireEvent.change(within(dialog).getByLabelText('Ends'), { target: { value: '06:00' } })
    await user.click(within(dialog).getByRole('button', { name: 'Add shift' }))

    await vi.waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/admin/driver-shifts')).toHaveLength(1))
    expect(requestsTo(fetchMock, 'POST', '/api/admin/driver-shifts')[0]?.body).toEqual({
      driver_id: 'd-1',
      starts_at: '2026-10-30T21:00:00.000Z',
      ends_at: '2026-10-31T05:00:00.000Z',
    })
  })

  it('adds a same-day shift with the default hours', async () => {
    const { fetchMock, user, dialog } = await openShifts(routes([{ path: '/api/admin/driver-shifts', method: 'POST', body: { id: 's-3' }, status: 201 }]))
    await user.click(within(dialog).getByRole('button', { name: 'Add shift' }))

    await vi.waitFor(() => expect(requestsTo(fetchMock, 'POST', '/api/admin/driver-shifts')).toHaveLength(1))
    expect(requestsTo(fetchMock, 'POST', '/api/admin/driver-shifts')[0]?.body).toEqual({
      driver_id: 'd-1',
      starts_at: '2026-10-28T05:00:00.000Z',
      ends_at: '2026-10-28T13:00:00.000Z',
    })
  })

  it('deletes a shift and shows why a change was refused', async () => {
    const { fetchMock, user, dialog } = await openShifts(
      routes([
        { path: '/api/admin/driver-shifts/s-1', method: 'DELETE', body: { id: 's-1' } },
        { path: '/api/admin/driver-shifts', method: 'POST', body: { code: 'conflict', message: 'This shift overlaps another one' }, status: 409 },
      ]),
    )
    const [first] = await within(dialog).findAllByRole('button', { name: 'Delete shift' })
    await user.click(first as HTMLElement)
    await vi.waitFor(() => expect(requestsTo(fetchMock, 'DELETE', '/api/admin/driver-shifts/s-1')).toHaveLength(1))

    await user.click(within(dialog).getByRole('button', { name: 'Add shift' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('This shift overlaps another one')

    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows when the shifts cannot be loaded', async () => {
    const { dialog } = await openShifts([
      { path: '/api/admin/driver-shifts', body: { code: 'internal_error', message: 'Shifts are unavailable' }, status: 500 },
      ...routes(),
    ])
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Shifts are unavailable')
  })
})
