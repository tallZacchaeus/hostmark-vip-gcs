import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, sentBody } from '@/tests/support/api-mock'
import { renderWithApp, sessionFor } from '@/tests/support/render'
import { EventForm } from './EventForm'
import type { EventSettings } from './types'

const EVENT: EventSettings = {
  id: 'e-1',
  name: 'Lagos Leadership Summit 2026',
  venue_name: 'Harbour Point Hotel',
  timezone: 'Africa/Lagos',
  starts_on: '2026-10-28',
  ends_on: '2026-10-31',
  arrival_airports: ['LOS'],
  intake_token: 'a'.repeat(32),
  intake_open: true,
  intake_window_days: 3,
  airport_exit_buffer_min: 30,
  airport_travel_min: 60,
  local_travel_min: 45,
  delay_threshold_min: 15,
  cleaning_delay_buffer_min: 15,
  program_lead_time_min: 30,
  flight_mode: 'simulated',
  auto_process_enabled: true,
  coordinator_phone: '+2348035550142',
}

describe('EventForm', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('saves the coordination desk phone as typed', async () => {
    const fetchMock = mockApi([{ path: '/api/admin/event', method: 'PATCH', body: EVENT }])
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithApp(<EventForm event={EVENT} onSaved={onSaved} />, sessionFor('admin'))

    const phone = screen.getByLabelText(/Coordination desk phone/)
    expect(phone).toHaveValue('+2348035550142')
    expect(phone).toHaveAttribute('type', 'tel')
    await user.clear(phone)
    await user.type(phone, '0803 555 0199')
    await user.click(screen.getByRole('button', { name: 'Save event' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(sentBody(fetchMock, 0)).toMatchObject({ coordinator_phone: '0803 555 0199' })
  })

  it('sends no number when the field is left blank', async () => {
    const fetchMock = mockApi([{ path: '/api/admin/event', method: 'PATCH', body: { ...EVENT, coordinator_phone: null } }])
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderWithApp(<EventForm event={EVENT} onSaved={onSaved} />, sessionFor('admin'))

    await user.clear(screen.getByLabelText(/Coordination desk phone/))
    await user.click(screen.getByRole('button', { name: 'Save event' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(sentBody(fetchMock, 0)).toMatchObject({ coordinator_phone: null })
  })

  it('shows why the server refused the number', async () => {
    mockApi([{ path: '/api/admin/event', method: 'PATCH', status: 400, body: { code: 'validation_failed', message: 'Enter a phone number, e.g. 0803 555 0142 or +2348035550142' } }])
    const user = userEvent.setup()
    renderWithApp(<EventForm event={EVENT} onSaved={vi.fn()} />, sessionFor('admin'))

    await user.clear(screen.getByLabelText(/Coordination desk phone/))
    await user.type(screen.getByLabelText(/Coordination desk phone/), 'reception')
    await user.click(screen.getByRole('button', { name: 'Save event' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a phone number')
  })
})
