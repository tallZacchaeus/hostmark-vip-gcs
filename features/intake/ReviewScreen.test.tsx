import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, sentBody } from '@/tests/support/api-mock'
import { renderWithApp } from '@/tests/support/render'
import { ReviewScreen } from './ReviewScreen'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/intake/s-1' }))

const MESSAGE = 'Good morning. Bishop Okafor arrives Wed on EK783 with his wife. Rev Chidi may also join later.'
const PASTED = {
  id: 's-1',
  reference_code: 'VIP-9M2X',
  source: 'pasted_message',
  status: 'needs_review',
  submitted_at: '2026-10-28T09:52:00Z',
  payload: { text: MESSAGE },
  normalized: { title: 'Bishop', full_name: 'Okafor', arrival_mode: 'flying', flight_number: 'EK783', others: MESSAGE, party: [{ name: '', role: 'family', dietary: '', accessibility: '' }] },
  extraction: { method: 'rules', error: null, items: [{ category: 'schedule', detail: 'Rev Chidi may also join later.', needs_attention: true, conflicts_with: null }] },
  issues: [
    { code: 'missing_departure_date', field: 'departure_date', severity: 'error', message: 'Enter the departure date' },
    { code: 'member_names_missing', field: 'party', severity: 'info', message: '1 of 1 people travelling with the guest have no name yet' },
  ],
  duplicate_kind: 'none',
  delegation_id: null,
  ai_model: 'rules',
  review_note: null,
  reviewed_at: null,
  reviewed_by_name: null,
  created_by_name: 'Ada Nwosu',
  matched: null,
}
const CATEGORIES = [{ id: 'c-1', name: 'Clergy / Executive', rank: 2 }]

describe('ReviewScreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    push.mockReset()
  })

  it('shows the original message beside what was read, with every check', async () => {
    mockApi([
      { path: '/api/intake/submissions/s-1', body: PASTED },
      { path: '/api/admin/vip-categories', body: CATEGORIES },
    ])
    renderWithApp(<ReviewScreen id="s-1" />)

    expect(await screen.findByText(MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Review submission' })).toBeInTheDocument()
    expect(screen.getByText('1 issue to check')).toBeInTheDocument()
    expect(screen.getByText('Enter the departure date')).toBeInTheDocument()
    expect(screen.getByText(/Needs attention: Rev Chidi may also join later/)).toBeInTheDocument()
    expect(screen.getByText('1 of 1 people travelling with the guest have no name yet')).toBeInTheDocument()
  })

  it('keeps the submission open and marks the field when approval finds something missing', async () => {
    const problem = { code: 'intake_incomplete', message: 'Fix the highlighted fields before approving', details: [{ code: 'missing_contact_name', field: 'contact_name', severity: 'error', message: "Enter the contact person's name" }] }
    mockApi([
      { path: '/api/intake/submissions/s-1/approve', method: 'POST', body: problem, status: 400 },
      { path: '/api/intake/submissions/s-1', body: PASTED },
      { path: '/api/admin/vip-categories', body: CATEGORIES },
    ])
    const user = userEvent.setup()
    renderWithApp(<ReviewScreen id="s-1" />)
    await screen.findByText(MESSAGE)

    await user.click(screen.getByRole('button', { name: 'Approve and create' }))
    expect(await screen.findByText('Fix the highlighted fields before approving')).toBeInTheDocument()
    expect(screen.getByText("Enter the contact person's name")).toBeInTheDocument()
  })

  it('approves the corrected form with the chosen VIP category', async () => {
    const fetchMock = mockApi([
      { path: '/api/intake/submissions/s-1/approve', method: 'POST', body: { delegation_id: 'd-1', principal_guest_id: 'g-1' }, status: 201 },
      { path: '/api/intake/submissions/s-1', body: PASTED },
      { path: '/api/admin/vip-categories', body: CATEGORIES },
    ])
    const user = userEvent.setup()
    renderWithApp(<ReviewScreen id="s-1" />)
    await screen.findByText(MESSAGE)

    await user.type(screen.getByLabelText(/^Departure date/), '2026-10-31')
    await user.selectOptions(await screen.findByLabelText(/VIP category/), 'c-1')
    await user.click(screen.getByRole('button', { name: 'Approve and create' }))

    expect(await screen.findByText('Delegation created')).toBeInTheDocument()
    const approveCall = fetchMock.mock.calls.findIndex(([url]) => String(url).endsWith('/approve'))
    expect(sentBody(fetchMock, approveCall)).toMatchObject({ vip_category_id: 'c-1', fields: { departure_date: '2026-10-31', flight_number: 'EK783' } })
  })

  it('compares a likely duplicate side by side and links it', async () => {
    const matched = {
      delegation_id: 'd-7',
      delegation_name: 'Hon. Ibrahim Bello',
      principal_guest_id: 'g-7',
      title: 'Hon.',
      full_name: 'Ibrahim Bello',
      companions: 4,
      arrival_mode: 'own_transport',
      arrival_at: '2026-10-28T14:00:00Z',
      flight_number: null,
      contact_name: null,
      contact_email: null,
      contact_phone: '+2348035550142',
      dietary: [],
      reference_code: null,
    }
    const duplicate = {
      ...PASTED,
      source: 'form',
      payload: { full_name: 'Ibrahim Belo' },
      normalized: { title: 'Hon.', full_name: 'Ibrahim Belo', arrival_mode: 'own_transport', arrival_date: '2026-10-28', arrival_time: '14:30', dietary: 'Halal', party: [] },
      issues: [],
      extraction: null,
      duplicate_kind: 'likely',
      matched,
    }
    const fetchMock = mockApi([
      { path: '/api/intake/submissions/s-1/link', method: 'POST', body: { delegation_id: 'd-7', principal_guest_id: 'g-7' } },
      { path: '/api/intake/submissions/s-1', body: duplicate },
      { path: '/api/admin/vip-categories', body: CATEGORIES },
    ])
    const user = userEvent.setup()
    renderWithApp(<ReviewScreen id="s-1" />)

    const incoming = await screen.findByRole('region', { name: 'New submission' })
    expect(within(incoming).getByText('Hon. Ibrahim Belo')).toBeInTheDocument()
    expect(within(incoming).getAllByText('Different').length).toBeGreaterThan(0)

    // Only rows that linking can update offer a tickbox: the diet differs; the arrival time does not get one.
    expect(within(incoming).getByRole('checkbox', { name: 'Apply the new diet' })).toBeInTheDocument()
    expect(within(incoming).queryByRole('checkbox', { name: /arrival/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Link to existing' }))
    await waitFor(() => expect(screen.getByText('Linked to the existing delegation')).toBeInTheDocument())
    const linkCall = fetchMock.mock.calls.findIndex(([url]) => String(url).endsWith('/link'))
    expect(sentBody(fetchMock, linkCall)).toEqual({ delegation_id: 'd-7', apply: [] })
  })

  it('sends the updates the reviewer ticks when linking', async () => {
    const matched = {
      delegation_id: 'd-7',
      delegation_name: 'Hon. Ibrahim Bello',
      principal_guest_id: 'g-7',
      title: 'Hon.',
      full_name: 'Ibrahim Bello',
      companions: 0,
      arrival_mode: 'own_transport',
      arrival_at: '2026-10-28T14:00:00Z',
      flight_number: null,
      contact_name: null,
      contact_email: null,
      contact_phone: '+2348035550142',
      dietary: [],
      reference_code: null,
    }
    const duplicate = {
      ...PASTED,
      source: 'form',
      payload: { full_name: 'Ibrahim Belo' },
      normalized: { title: 'Hon.', full_name: 'Ibrahim Belo', arrival_mode: 'own_transport', arrival_date: '2026-10-28', arrival_time: '14:00', dietary: 'Halal', contact_phone: '08035550199', party: [{ name: 'Musa Bello', role: 'family' }] },
      issues: [],
      extraction: null,
      duplicate_kind: 'likely',
      matched,
    }
    const fetchMock = mockApi([
      { path: '/api/intake/submissions/s-1/link', method: 'POST', body: { delegation_id: 'd-7', principal_guest_id: 'g-7', applied: ['dietary', 'companions'] } },
      { path: '/api/intake/submissions/s-1', body: duplicate },
      { path: '/api/admin/vip-categories', body: CATEGORIES },
    ])
    const user = userEvent.setup()
    renderWithApp(<ReviewScreen id="s-1" />)

    const incoming = await screen.findByRole('region', { name: 'New submission' })
    await user.click(within(incoming).getByRole('checkbox', { name: 'Apply the new diet' }))
    await user.click(within(incoming).getByRole('checkbox', { name: 'Add the new guests' }))
    await user.click(screen.getByRole('button', { name: 'Link to existing' }))

    await waitFor(() => expect(screen.getByText('Linked; the existing delegation was updated')).toBeInTheDocument())
    const linkCall = fetchMock.mock.calls.findIndex(([url]) => String(url).endsWith('/link'))
    expect(sentBody(fetchMock, linkCall)).toEqual({ delegation_id: 'd-7', apply: ['dietary', 'companions'] })
  })
})
