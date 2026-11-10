import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '@/tests/support/api-mock'
import { requestsTo } from '@/tests/support/fetch-calls'
import { renderWithApp } from '@/tests/support/render'
import { FlightTimeEditor } from './FlightTimeEditor'

const LAGOS = 'Africa/Lagos'

describe('FlightTimeEditor', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('checks the flight now and says when nothing changed', async () => {
    const fetchMock = mockApi([{ path: '/api/flights/f-1/refresh', method: 'POST', body: { changed: false, proposal_ids: [] } }])
    renderWithApp(<FlightTimeEditor flightId="f-1" manualArrivalAt={null} landingAt="2026-10-28T14:10:00Z" timeZone={LAGOS} />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Check now' }))

    expect(await screen.findByText('Flight data unchanged.')).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'POST', '/api/flights/f-1/refresh')[0]?.body).toEqual({})
  })

  it('reports driver decisions waiting after a change', async () => {
    mockApi([{ path: '/api/flights/f-1/refresh', method: 'POST', body: { changed: true, proposal_ids: ['p-1', 'p-2'] } }])
    renderWithApp(<FlightTimeEditor flightId="f-1" manualArrivalAt={null} landingAt={null} timeZone={LAGOS} />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Check now' }))
    expect(await screen.findByText('Updated. 2 driver decision(s) are waiting for you.')).toBeInTheDocument()
  })

  it('shows a hand-set landing time and goes back to flight data on request', async () => {
    const fetchMock = mockApi([{ path: '/api/flights/f-1/override', method: 'POST', body: { changed: true, proposal_ids: [] } }])
    renderWithApp(<FlightTimeEditor flightId="f-1" manualArrivalAt="2026-10-28T14:10:00Z" landingAt="2026-10-28T14:10:00Z" timeZone={LAGOS} />)

    expect(screen.getByText('Landing time set by hand: 15:10.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check now' })).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Use flight data again' }))

    expect(await screen.findByText('Updated. Pickups moved and drivers were told.')).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'POST', '/api/flights/f-1/override')[0]?.body).toEqual({ manual_arrival_at: null })
  })

  it('sets a landing time in the event zone, prefilled from the best known time', async () => {
    const fetchMock = mockApi([{ path: '/api/flights/f-1/override', method: 'POST', body: { changed: true, proposal_ids: [] } }])
    const user = userEvent.setup()
    renderWithApp(<FlightTimeEditor flightId="f-1" manualArrivalAt={null} landingAt="2026-10-28T14:10:00Z" timeZone={LAGOS} />)

    await user.click(screen.getByRole('button', { name: 'Set landing time' }))
    expect(screen.getByLabelText('Day')).toHaveValue('2026-10-28')
    const time = screen.getByLabelText('Lands at (Africa/Lagos)')
    expect(time).toHaveValue('15:10')
    fireEvent.change(time, { target: { value: '15:40' } })
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Updated. Pickups moved and drivers were told.')).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'POST', '/api/flights/f-1/override')[0]?.body).toEqual({ manual_arrival_at: '2026-10-28T14:40:00.000Z' })
    expect(screen.getByRole('button', { name: 'Set landing time' })).toBeInTheDocument()
  })

  it('needs both a day and a time, and can be cancelled', async () => {
    const user = userEvent.setup()
    renderWithApp(<FlightTimeEditor flightId="f-1" manualArrivalAt={null} landingAt={null} timeZone={LAGOS} />)

    await user.click(screen.getByRole('button', { name: 'Set landing time' }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2026-10-28' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Set landing time' })).toBeInTheDocument()
  })

  it('keeps the form open and shows why a time was refused', async () => {
    mockApi([{ path: '/api/flights/f-1/override', method: 'POST', body: { code: 'validation_failed', message: 'The landing time is outside the event' }, status: 400 }])
    const user = userEvent.setup()
    renderWithApp(<FlightTimeEditor flightId="f-1" manualArrivalAt={null} landingAt="2026-10-28T14:10:00Z" timeZone={LAGOS} />)

    await user.click(screen.getByRole('button', { name: 'Set landing time' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The landing time is outside the event')
    expect(screen.getByLabelText('Day')).toBeInTheDocument()
  })

  it('shows why a flight check failed', async () => {
    mockApi([{ path: '/api/flights/f-1/refresh', method: 'POST', body: { code: 'provider_unavailable', message: 'Flight data is unavailable right now' }, status: 503 }])
    renderWithApp(<FlightTimeEditor flightId="f-1" manualArrivalAt={null} landingAt={null} timeZone={LAGOS} />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Check now' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Flight data is unavailable right now')
  })
})
