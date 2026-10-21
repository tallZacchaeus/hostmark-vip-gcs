import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, sentBody } from '@/tests/support/api-mock'
import { renderWithApp } from '@/tests/support/render'
import { GuestProfileScreen } from './GuestProfileScreen'

const PROFILE = {
  guest: {
    id: 'g-1',
    delegation_id: 'd-1',
    title: 'Bishop',
    full_name: 'Augustine Okafor',
    member_role: 'principal',
    is_placeholder: false,
    status: 'expected',
    dietary: ['Vegetarian'],
    accessibility: null,
    category_name: 'Clergy / Executive',
    vip_category_id: 'c-2',
    organisation: 'Diocese of Lagos West',
    position: null,
    proximity_priority: 'normal',
    share_group: null,
    notes: null,
    expected_departure_at: '2026-10-31T11:00:00Z',
    version: 3,
  },
  delegation: { id: 'd-1', name: 'Bishop Augustine Okafor', status: 'expected', contact_name: 'Grace Adeyemi', contact_email: 'office@example.com', contact_phone: '+2348030000101' },
  members: [
    { id: 'g-1', title: 'Bishop', full_name: 'Augustine Okafor', member_role: 'principal', is_placeholder: false, status: 'expected', dietary: [], accessibility: null, category_name: null, version: 3 },
    { id: 'g-2', title: null, full_name: null, member_role: 'security', is_placeholder: true, status: 'expected', dietary: [], accessibility: null, category_name: null, version: 1 },
  ],
  arrival: { id: 'a-1', mode: 'flying', stated_arrival_at: '2026-10-28T12:40:00Z', requested_pickup_at: null, pickup_address: null, expected_at_venue_at: '2026-10-28T14:10:00Z', status: 'expected' },
  flight: { id: 'f-1', flight_number: 'EK783', origin_iata: 'DXB', destination_iata: 'LOS', scheduled_arrival_at: '2026-10-28T12:40:00Z', estimated_arrival_at: null, actual_arrival_at: null, manual_arrival_at: null, phase: 'scheduled' },
  pickup: { id: 'p-1', kind: 'airport', pickup_location: 'LOS airport, arrivals', dropoff_location: 'Harbour Point', pickup_at: '2026-10-28T13:10:00Z', passenger_count: 2, status: 'pending_assignment' },
  requirements: [
    { id: 'r-1', guest_id: 'g-1', category: 'schedule', detail: 'Rev Chidi may join later', source: 'extraction', needs_attention: true, conflicts_with: null, resolved_at: null, submission_source: 'pasted_message', reference_code: 'VIP-9M2X' },
    { id: 'r-2', guest_id: 'g-1', category: 'medical', detail: 'Nut allergy', source: 'extraction', needs_attention: true, conflicts_with: null, resolved_at: null, submission_source: 'form', reference_code: 'VIP-AB12' },
    { id: 'r-3', guest_id: 'g-1', category: 'dietary', detail: 'Vegetarian meals', source: 'extraction', needs_attention: false, conflicts_with: null, resolved_at: null, submission_source: 'form', reference_code: null },
  ],
  submissions: [{ id: 's-1', reference_code: 'VIP-AB12', source: 'form', status: 'auto_processed', submitted_at: '2026-10-26T09:00:00Z' }],
  history: [
    {
      id: '41',
      occurred_at: '2026-10-26T09:00:05Z',
      actor_type: 'guest_intake',
      actor_id: null,
      actor_name: null,
      action: 'delegations.insert',
      entity_type: 'delegations',
      entity_id: 'd-1',
      before: null,
      after: { name: 'Bishop Augustine Okafor' },
      reason: null,
      proposal_id: null,
      is_automatic: true,
      undoable: true,
      undo_of_audit_id: null,
      undone: false,
    },
  ],
}

const ROUTES = [
  { path: '/api/guests/g-1', body: PROFILE },
  { path: '/api/admin/vip-categories', body: [{ id: 'c-2', name: 'Clergy / Executive', rank: 2 }] },
  { path: '/api/guest-requirements/r-2/resolve', method: 'POST', body: { id: 'r-2' } },
  { path: '/api/delegations/d-1/members', method: 'POST', body: { id: 'g-3' }, status: 201 },
  { path: '/api/guests/g-2', method: 'DELETE', body: { id: 'g-2' } },
  { path: '/api/audit/41/undo', method: 'POST', body: {} },
  { path: '/api/guests/g-1', method: 'PATCH', body: { ...PROFILE.guest, version: 4 } },
]

const callTo = (fetchMock: ReturnType<typeof mockApi>, path: string, method: string) =>
  fetchMock.mock.calls.findIndex(([url, init]) => String(url) === path && (init?.method ?? 'GET') === method)

describe('GuestProfileScreen', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the party, arrival, transport, issues and history', async () => {
    mockApi(ROUTES)
    renderWithApp(<GuestProfileScreen id="g-1" />)

    expect(await screen.findByRole('heading', { name: 'Bishop Augustine Okafor' })).toBeInTheDocument()
    expect(screen.getByText('Party of 2 · Vegetarian · Diocese of Lagos West')).toBeInTheDocument()
    const party = screen.getByRole('region', { name: 'Party' })
    expect(within(party).getByText('Name to follow')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Arrival' })).getByText('EK783')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Transport' })).getByText('LOS airport, arrivals')).toBeInTheDocument()
    expect(screen.getByText('Rev Chidi may join later')).toBeInTheDocument()
    expect(screen.getByText(/Vegetarian meals/)).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'History' })).getByText(/Guest registration added delegation Bishop Augustine Okafor/)).toBeInTheDocument()
  })

  it('shows each member’s room or suggestion, and the guest’s own room in the header', async () => {
    const stay = { id: 's-1', guest_id: 'g-1', status: 'planned' as const, expected_check_in_at: '2026-10-28T14:10:00Z', expected_check_out_at: '2026-10-31T11:00:00Z', is_manual_override: true, override_reason: 'Asked for it', room_id: 'r-501', number: '501', floor: 5, wing: 'West', room_type: 'Executive Suite' }
    mockApi([{ path: '/api/guests/g-1', body: { ...PROFILE, stays: [stay], room_suggestions: [{ id: 'p-9', parent_id: 'plan-1', guest_id: 'g-2', room_number: '502' }] } }, ...ROUTES.slice(1)])
    renderWithApp(<GuestProfileScreen id="g-1" />)

    expect(await screen.findByText('Room 501')).toBeInTheDocument()
    const card = screen.getByRole('region', { name: 'Room' })
    expect(within(card).getByText('501')).toBeInTheDocument()
    expect(within(card).getByText(/Executive Suite · West wing, floor 5 · From Wed 28 Oct · placed by hand/)).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'waiting for approval' })).toHaveAttribute('href', '/rooms/plan/plan-1')
    expect(within(card).getByRole('button', { name: 'Change room' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Assign a room' })).toBeInTheDocument()
  })

  it('dismisses an issue, adds an uncertain person as a guest and removes a member', async () => {
    const fetchMock = mockApi(ROUTES)
    const user = userEvent.setup()
    renderWithApp(<GuestProfileScreen id="g-1" />)
    await screen.findByText('Nut allergy')

    const allergy = screen.getByText('Nut allergy').closest('.issue-item') as HTMLElement
    await user.click(within(allergy).getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(callTo(fetchMock, '/api/guest-requirements/r-2/resolve', 'POST')).toBeGreaterThan(-1))

    await user.click(screen.getByRole('button', { name: 'Add as guest' }))
    await waitFor(() => expect(callTo(fetchMock, '/api/delegations/d-1/members', 'POST')).toBeGreaterThan(-1))
    expect(sentBody(fetchMock, callTo(fetchMock, '/api/delegations/d-1/members', 'POST'))).toEqual({ member_role: 'other', full_name: '', requirement_id: 'r-1' })

    await user.click(screen.getByRole('button', { name: 'Remove Name to follow from the party' }))
    await waitFor(() => expect(callTo(fetchMock, '/api/guests/g-2', 'DELETE')).toBeGreaterThan(-1))
  })

  it('undoes an automatic change from the history', async () => {
    const fetchMock = mockApi(ROUTES)
    renderWithApp(<GuestProfileScreen id="g-1" />)
    await screen.findByText(/Guest registration added/)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(callTo(fetchMock, '/api/audit/41/undo', 'POST')).toBeGreaterThan(-1))
    expect(await screen.findByText('Change undone')).toBeInTheDocument()
  })

  it('edits coordinator-only details with the version read', async () => {
    const fetchMock = mockApi(ROUTES)
    const user = userEvent.setup()
    renderWithApp(<GuestProfileScreen id="g-1" />)
    await screen.findByRole('heading', { name: 'Bishop Augustine Okafor' })

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit guest' })
    await user.selectOptions(within(dialog).getByLabelText('Proximity priority'), 'high')
    await user.type(within(dialog).getByLabelText(/Room-share group/), 'okafor')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(callTo(fetchMock, '/api/guests/g-1', 'PATCH')).toBeGreaterThan(-1))
    expect(sentBody(fetchMock, callTo(fetchMock, '/api/guests/g-1', 'PATCH'))).toMatchObject({ version: 3, proximity_priority: 'high', share_group: 'okafor', dietary: ['Vegetarian'] })
    expect(await screen.findByText('Guest updated')).toBeInTheDocument()
  })

  it('says when the guest does not exist', async () => {
    mockApi([{ path: '/api/guests/g-404', body: { code: 'not_found', message: 'Guest not found' }, status: 404 }])
    renderWithApp(<GuestProfileScreen id="g-404" />)
    expect(await screen.findByText('This guest does not exist.')).toBeInTheDocument()
  })
})
