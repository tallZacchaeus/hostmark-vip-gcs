import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, sentBody } from '@/tests/support/api-mock'
import { renderWithApp, sessionFor } from '@/tests/support/render'
import { DriverScreen } from './DriverScreen'
import type { DriverTrip } from './model'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/driver' }))

const trip = (overrides: Partial<DriverTrip>): DriverTrip => ({
  assignment_id: 'as-1',
  status: 'active',
  acknowledged_at: null,
  en_route_at: null,
  picked_up_at: null,
  completed_at: null,
  released_at: null,
  pickup_id: 'pk-1',
  pickup_status: 'assigned',
  kind: 'airport',
  pickup_at: '2026-10-28T13:55:00.000Z',
  previous_pickup_at: '2026-10-28T13:10:00.000Z',
  changed_at: '2026-10-28T10:15:00.000Z',
  pickup_location: 'Murtala Muhammed Airport, arrivals',
  dropoff_location: 'Harbour Point Hotel',
  passenger_count: 4,
  flight_number: 'EK783',
  flight_phase: 'in_air',
  delay_minutes: 45,
  principal: { title: 'Bishop', full_name: 'Augustine Okafor', category: 'Cat. 1' },
  passengers: [
    { title: 'Bishop', full_name: 'Augustine Okafor', role: 'principal' },
    { title: 'Mrs.', full_name: 'Chioma Okafor', role: 'spouse' },
  ],
  ...overrides,
})

const driverSession = { ...sessionFor('driver'), user: { id: 'u-9', fullName: 'Emeka Oladipo', email: 'emeka@example.com', role: 'driver' as const } }

describe('DriverScreen', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the next pickup big, with the changed time to confirm and one button to start', async () => {
    const fetchMock = mockApi([
      { path: '/api/driver/pickups', body: { day: '2026-10-28', trips: [trip({}), trip({ assignment_id: 'as-2', status: 'released', pickup_at: '2026-10-28T16:00:00.000Z', passenger_count: 1, principal: { title: 'Dr', full_name: 'Ngozi Eze', category: null } })] } },
      { path: '/api/driver/assignments/as-1/status', method: 'POST', body: { assignment_id: 'as-1', status: 'en_route' } },
      { path: '/api/driver/assignments/as-1/acknowledge', method: 'POST', body: { assignment_id: 'as-1' } },
    ])
    renderWithApp(<DriverScreen />, driverSession)

    expect(await screen.findByText('Hello, Emeka')).toBeInTheDocument()
    expect(await screen.findByText('Time changed from 14:10.')).toBeInTheDocument()
    expect(screen.getByText('Delayed +45 min')).toBeInTheDocument()
    expect(screen.getByText('Bishop Augustine Okafor')).toBeInTheDocument()
    expect(screen.getByText('+3')).toBeInTheDocument()
    expect(screen.getByText('This pickup was moved to another driver.')).toBeInTheDocument()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Got it' }))
    await user.click(screen.getByRole('button', { name: 'Start pickup' }))

    await waitFor(() => {
      const statusCall = fetchMock.mock.calls.findIndex(([url]) => String(url).includes('/as-1/status'))
      expect(statusCall).toBeGreaterThanOrEqual(0)
      expect(sentBody(fetchMock, statusCall)).toEqual({ status: 'en_route' })
    })
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/as-1/acknowledge'))).toBe(true)
  })

  it('opens the trip details with passengers', async () => {
    mockApi([{ path: '/api/driver/pickups', body: { day: '2026-10-28', trips: [trip({ acknowledged_at: '2026-10-28T10:20:00.000Z' })] } }])
    renderWithApp(<DriverScreen />, driverSession)

    await userEvent.setup().click(await screen.findByRole('button', { name: /Details for the 14:55 pickup/ }))

    const sheet = screen.getByRole('dialog', { name: '14:55' })
    expect(sheet).toHaveTextContent('Harbour Point Hotel')
    expect(sheet).toHaveTextContent('Mrs. Chioma Okafor')
    expect(sheet).toHaveTextContent('EK783 · Delayed +45 min')
  })

  it('offers to call the coordination desk with the trip and in its details', async () => {
    mockApi([{ path: '/api/driver/pickups', body: { day: '2026-10-28', coordinator_phone: '+2348035550142', trips: [trip({ acknowledged_at: '2026-10-28T10:20:00.000Z' })] } }])
    renderWithApp(<DriverScreen />, driverSession)

    const call = await screen.findByRole('link', { name: 'Call coordinator' })
    expect(call).toHaveAttribute('href', 'tel:+2348035550142')

    await userEvent.setup().click(screen.getByRole('button', { name: /Details for the 14:55 pickup/ }))
    const sheet = screen.getByRole('dialog', { name: '14:55' })
    expect(within(sheet).getByRole('link', { name: 'Call coordinator' })).toHaveAttribute('href', 'tel:+2348035550142')
  })

  it('offers the call on a quiet day too', async () => {
    mockApi([{ path: '/api/driver/pickups', body: { day: '2026-10-28', coordinator_phone: '+2348035550142', trips: [] } }])
    renderWithApp(<DriverScreen />, driverSession)

    expect(await screen.findByText('No pickups today.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Call coordinator' })).toHaveAttribute('href', 'tel:+2348035550142')
  })

  it('shows no call button when the event has no coordinator number', async () => {
    mockApi([{ path: '/api/driver/pickups', body: { day: '2026-10-28', coordinator_phone: null, trips: [trip({ acknowledged_at: '2026-10-28T10:20:00.000Z' })] } }])
    renderWithApp(<DriverScreen />, driverSession)

    await userEvent.setup().click(await screen.findByRole('button', { name: /Details for the 14:55 pickup/ }))
    expect(screen.queryByRole('link', { name: 'Call coordinator' })).not.toBeInTheDocument()
  })

  it('shows a quiet day and switches to tomorrow', async () => {
    const fetchMock = mockApi([{ path: '/api/driver/pickups', body: { day: '2026-10-28', trips: [] } }])
    renderWithApp(<DriverScreen />, driverSession)
    expect(await screen.findByText('No pickups today.')).toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Tomorrow' }))

    expect(await screen.findByText('No pickups tomorrow yet.')).toBeInTheDocument()
    const days = fetchMock.mock.calls.map(([url]) => new URL(String(url), 'http://x').searchParams.get('day'))
    expect(new Set(days).size).toBe(2)
  })
})
