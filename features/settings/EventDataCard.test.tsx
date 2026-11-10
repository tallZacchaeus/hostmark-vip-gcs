import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '@/tests/support/api-mock'
import { requestsTo } from '@/tests/support/fetch-calls'
import { renderWithApp, sessionFor } from '@/tests/support/render'
import { EventDataCard } from './EventDataCard'
import type { EventSettings } from './types'

const ENDED = { name: 'Lagos Leadership Summit 2026', timezone: 'Africa/Lagos', starts_on: '2025-10-28', ends_on: '2025-10-31' }
const event = (overrides: Partial<EventSettings> = {}): EventSettings => ({ ...ENDED, ...overrides }) as EventSettings

describe('EventDataCard', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:export'), revokeObjectURL: vi.fn() }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('downloads the export', async () => {
    const fetchMock = mockApi([{ path: '/api/admin/data/export', method: 'POST', body: { guests: [] } }])
    const user = userEvent.setup()
    renderWithApp(<EventDataCard event={event()} />, sessionFor('super_admin'))

    await user.click(screen.getByRole('button', { name: 'Download export' }))
    expect(requestsTo(fetchMock, 'POST', '/api/admin/data/export')).toHaveLength(1)
    expect(await screen.findByText('Export downloaded.')).toBeInTheDocument()
  })

  it('shows why an export failed', async () => {
    mockApi([{ path: '/api/admin/data/export', method: 'POST', status: 429, body: { code: 'rate_limited', message: 'Too many requests, please wait and try again' } }])
    const user = userEvent.setup()
    renderWithApp(<EventDataCard event={event()} />, sessionFor('super_admin'))

    await user.click(screen.getByRole('button', { name: 'Download export' }))
    expect(await screen.findByText('Too many requests, please wait and try again')).toBeInTheDocument()
  })

  it('removes guest personal data only after the event name is typed', async () => {
    const fetchMock = mockApi([{ path: '/api/admin/data/purge', method: 'POST', body: { guests: 12 } }])
    const user = userEvent.setup()
    renderWithApp(<EventDataCard event={event()} />, sessionFor('super_admin'))

    await user.click(screen.getByRole('button', { name: 'Remove guest personal data' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('best effort')
    const confirm = screen.getByRole('button', { name: 'Remove personal data' })
    expect(confirm).toBeDisabled()

    const input = screen.getByLabelText(/Type the event name/)
    await user.type(input, 'Lagos Leadership')
    expect(confirm).toBeDisabled()
    await user.type(input, ' Summit 2026')
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    expect(requestsTo(fetchMock, 'POST', '/api/admin/data/purge')).toEqual([
      expect.objectContaining({ body: { confirmation: 'Lagos Leadership Summit 2026' } }),
    ])
    expect(await screen.findByText('Guest personal data removed.')).toBeInTheDocument()
    expect(dialog).not.toBeInTheDocument()
  })

  it('keeps the dialog open with the error when the purge is refused', async () => {
    mockApi([
      { path: '/api/admin/data/purge', method: 'POST', status: 409, body: { code: 'event_not_ended', message: 'Guest personal data can be removed only after the event has ended (after 2025-10-31)' } },
    ])
    const user = userEvent.setup()
    renderWithApp(<EventDataCard event={event()} />, sessionFor('super_admin'))

    await user.click(screen.getByRole('button', { name: 'Remove guest personal data' }))
    await user.type(screen.getByLabelText(/Type the event name/), ENDED.name)
    await user.click(screen.getByRole('button', { name: 'Remove personal data' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('only after the event has ended')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('offers the purge only once the event is over', () => {
    mockApi([])
    renderWithApp(<EventDataCard event={event({ starts_on: '2099-01-01', ends_on: '2099-01-03' })} />, sessionFor('super_admin'))

    expect(screen.getByRole('button', { name: 'Remove guest personal data' })).toBeDisabled()
    expect(screen.getByText(/Available after the event ends on 3 January 2099/)).toBeInTheDocument()
  })

  it('shows nothing to other roles', () => {
    mockApi([])
    renderWithApp(<EventDataCard event={event()} />, sessionFor('admin'))
    expect(screen.queryByRole('button', { name: 'Download export' })).not.toBeInTheDocument()
  })
})
