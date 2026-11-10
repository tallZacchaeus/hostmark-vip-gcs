import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuditEntry } from '@/lib/client/activity-format'
import { mockApi, type MockRoute } from '@/tests/support/api-mock'
import { requestsTo } from '@/tests/support/fetch-calls'
import { renderWithApp } from '@/tests/support/render'
import { ActivityScreen } from './ActivityScreen'

const entry = (overrides: Partial<AuditEntry>): AuditEntry => ({
  id: '1',
  occurred_at: '2026-10-28T09:20:00Z',
  actor_type: 'system',
  actor_id: null,
  actor_name: null,
  action: 'rooms.update',
  entity_type: 'rooms',
  entity_id: 'r-412',
  before: { number: '412', out_of_service: false },
  after: { number: '412', out_of_service: true },
  reason: null,
  proposal_id: null,
  is_automatic: true,
  undoable: true,
  undo_of_audit_id: null,
  undone: false,
  ...overrides,
})

const roomChange = entry({})
const newDriver = entry({
  id: '2',
  actor_type: 'user',
  actor_id: 'u-2',
  actor_name: 'Tolu Adebayo',
  action: 'drivers.insert',
  entity_type: 'drivers',
  entity_id: 'd-1',
  before: null,
  after: { full_name: 'Musa Bello' },
  reason: 'Extra car for the gala',
  is_automatic: false,
  undoable: false,
})
const suggestion = entry({
  id: '3',
  actor_type: 'copilot',
  action: 'proposals.create',
  entity_type: 'proposals',
  entity_id: 'p-1',
  before: null,
  after: { title: 'Move the Okafor pickup to 14:00' },
  is_automatic: false,
  undoable: false,
})

const auditRoute = (body: unknown = [roomChange, newDriver, suggestion], meta = { total: 3, page: 1, limit: 200 }): MockRoute => ({ path: '/api/audit', body, meta })

function lastAuditQuery(fetchMock: ReturnType<typeof mockApi>): URLSearchParams {
  const requests = requestsTo(fetchMock, 'GET', '/api/audit')
  return new URL(requests.at(-1)?.url ?? '', 'http://localhost').searchParams
}

describe('ActivityScreen', () => {
  beforeEach(() => {
    // 11:30 in Lagos on the second day of the event.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T10:30:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("shows today's changes, newest first, for the event's day", async () => {
    const fetchMock = mockApi([auditRoute()])
    renderWithApp(<ActivityScreen />)

    expect(screen.getByRole('heading', { name: 'Wednesday 28 October' })).toBeInTheDocument()
    expect(await screen.findByText('3 changes')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'room 412' })).toHaveAttribute('href', '/rooms')
    expect(screen.getByText('Tolu Adebayo')).toBeInTheDocument()
    expect(screen.getByText('Reason: Extra car for the gala')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '“Move the Okafor pickup to 14:00”' })).toBeInTheDocument()

    const query = lastAuditQuery(fetchMock)
    expect(query.get('limit')).toBe('200')
    expect(query.get('from')).toBe('2026-10-27T23:00:00.000Z')
    expect(query.get('to')).toBe('2026-10-28T23:00:00.000Z')
    expect(query.has('automatic')).toBe(false)
    expect(query.has('actor_type')).toBe(false)
    expect(query.has('entity_types')).toBe(false)
  })

  it('searches the loaded changes and offers to clear filters when nothing matches', async () => {
    mockApi([auditRoute()])
    const user = userEvent.setup()
    renderWithApp(<ActivityScreen />)
    await screen.findByText('3 changes')

    const search = screen.getByPlaceholderText('Search activity')
    await user.type(search, 'gala')
    expect(screen.getByText('1 change')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'room 412' })).not.toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'nothing like this')
    expect(screen.getByText('No activity matches these filters.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(search).toHaveValue('')
    expect(await screen.findByText('3 changes')).toBeInTheDocument()
  })

  it('asks the API for automatic, staff or Victoria changes of one type', async () => {
    const fetchMock = mockApi([auditRoute()])
    const user = userEvent.setup()
    renderWithApp(<ActivityScreen />)
    await screen.findByText('3 changes')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Who' }), 'automatic')
    await waitFor(() => expect(lastAuditQuery(fetchMock).get('automatic')).toBe('true'))

    await user.selectOptions(screen.getByRole('combobox', { name: 'Who' }), 'staff')
    await waitFor(() => expect(lastAuditQuery(fetchMock).get('actor_type')).toBe('user'))

    await user.selectOptions(screen.getByRole('combobox', { name: 'Who' }), 'copilot')
    await waitFor(() => expect(lastAuditQuery(fetchMock).get('actor_type')).toBe('copilot'))

    await user.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'Rooms')
    await waitFor(() => expect(lastAuditQuery(fetchMock).get('entity_types')).toBe('rooms,room_types,room_assignments'))
    expect(screen.getByText('Type: Rooms')).toBeInTheDocument()
  })

  it("switches to yesterday's changes", async () => {
    const fetchMock = mockApi([auditRoute([])])
    const user = userEvent.setup()
    renderWithApp(<ActivityScreen />)
    expect(await screen.findByText('Nothing has changed on this day.')).toBeInTheDocument()
    expect(screen.getByText('Changes by staff, Victoria and automatic updates appear here.')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Day' }), 'yesterday')

    expect(screen.getByRole('heading', { name: 'Tuesday 27 October' })).toBeInTheDocument()
    await waitFor(() => expect(lastAuditQuery(fetchMock).get('from')).toBe('2026-10-26T23:00:00.000Z'))
    expect(lastAuditQuery(fetchMock).get('to')).toBe('2026-10-27T23:00:00.000Z')
  })

  it('undoes an automatic change and confirms it', async () => {
    const fetchMock = mockApi([auditRoute(), { path: '/api/audit/1/undo', method: 'POST', body: { id: '9' } }])
    const user = userEvent.setup()
    renderWithApp(<ActivityScreen />)
    await screen.findByText('3 changes')
    const loads = requestsTo(fetchMock, 'GET', '/api/audit').length

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(await screen.findByText('Undone: updated room 412.')).toBeInTheDocument()
    expect(requestsTo(fetchMock, 'POST', '/api/audit/1/undo')).toHaveLength(1)
    await waitFor(() => expect(requestsTo(fetchMock, 'GET', '/api/audit').length).toBeGreaterThan(loads))
  })

  it('reports an undo the server refuses', async () => {
    mockApi([auditRoute(), { path: '/api/audit/1/undo', method: 'POST', body: { code: 'conflict', message: 'The room has changed since' }, status: 409 }])
    const user = userEvent.setup()
    renderWithApp(<ActivityScreen />)
    await screen.findByText('3 changes')

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('The room has changed since')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()
  })

  it('opens and closes the field changes of a record', async () => {
    mockApi([auditRoute([roomChange])])
    const user = userEvent.setup()
    renderWithApp(<ActivityScreen />)
    await screen.findByText('1 change')

    await user.click(screen.getByRole('button', { name: 'Show changes' }))
    expect(screen.getByText('Out of service')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hide changes' }))
    expect(screen.queryByText('Out of service')).not.toBeInTheDocument()
  })

  it('says when only the newest changes are shown', async () => {
    mockApi([auditRoute([roomChange], { total: 350, page: 1, limit: 200 })])
    renderWithApp(<ActivityScreen />)
    expect(await screen.findByText('Showing the newest 200 of 350. Narrow the filters to see older changes.')).toBeInTheDocument()
  })

  it('shows a load failure with Retry', async () => {
    const fetchMock = mockApi([{ path: '/api/audit', body: { code: 'internal_error', message: 'Activity is unavailable' }, status: 500 }])
    const user = userEvent.setup()
    renderWithApp(<ActivityScreen />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Activity is unavailable')
    const loads = requestsTo(fetchMock, 'GET', '/api/audit').length
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(requestsTo(fetchMock, 'GET', '/api/audit').length).toBeGreaterThan(loads))
  })
})
