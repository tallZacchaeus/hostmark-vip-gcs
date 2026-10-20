import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, sentBody } from '@/tests/support/api-mock'
import { renderWithApp } from '@/tests/support/render'
import { IntakeScreen } from './IntakeScreen'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/intake' }))

const ROW = {
  id: 's-1',
  reference_code: 'VIP-DEM1',
  source: 'form',
  status: 'needs_review',
  submitted_at: '2026-10-28T09:30:00Z',
  duplicate_kind: 'likely',
  issues: [{ code: 'missing_departure_date', field: 'departure_date', severity: 'error', message: 'Enter the departure date' }],
  delegation_id: null,
  title: 'Hon.',
  full_name: 'Ibrahim Belo',
}
const LIST = { rows: [ROW], tabs: { review: 3, duplicates: 1, missing: 1, flagged: 1, processed: 14, rejected: 0 }, link: { token: 'tok123', open: true } }
const READING = {
  fields: { title: 'Bishop', full_name: 'Okafor', arrival_mode: 'flying', flight_number: 'EK783', party: [{ name: '', role: 'family', dietary: '', accessibility: '' }] },
  extraction: { method: 'rules', items: [{ category: 'schedule', detail: 'Rev Chidi may also join later.', needs_attention: true, conflicts_with: null }] },
}

describe('IntakeScreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    push.mockReset()
  })

  it('lists submissions with their reasons and counts per tab', async () => {
    const fetchMock = mockApi([{ path: '/api/intake/submissions', body: LIST, meta: { total: 1, page: 1, limit: 100 } }])
    renderWithApp(<IntakeScreen />)

    expect(await screen.findByText('VIP-DEM1')).toBeInTheDocument()
    expect(screen.getByText('Hon. Ibrahim Belo')).toBeInTheDocument()
    expect(screen.getByText('Likely duplicate')).toBeInTheDocument()
    expect(screen.getAllByText('Missing details')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Review VIP-DEM1' })).toHaveAttribute('href', '/intake/s-1')
    expect(screen.getByRole('tab', { name: /Processed/ })).toHaveTextContent('14')

    await userEvent.setup().click(screen.getByRole('tab', { name: /Flagged/ }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('tab=flagged'))).toBe(true))
  })

  it('copies the shared registration link', async () => {
    mockApi([{ path: '/api/intake/submissions', body: LIST }])
    const user = userEvent.setup()
    renderWithApp(<IntakeScreen />)
    await screen.findByText('VIP-DEM1')

    await user.click(screen.getByRole('button', { name: 'Copy registration link' }))
    expect(await screen.findByText('Registration link copied')).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/register/tok123`)
  })

  it('reads a pasted message, shows what is missing and uncertain, then saves a draft', async () => {
    const fetchMock = mockApi([
      { path: '/api/intake/submissions', body: LIST },
      { path: '/api/intake/read-message', method: 'POST', body: READING },
      { path: '/api/intake/submissions', method: 'POST', body: { id: 's-9', reference_code: 'VIP-NEW1' }, status: 201 },
    ])
    const user = userEvent.setup()
    renderWithApp(<IntakeScreen />)
    await screen.findByText('VIP-DEM1')

    await user.click(screen.getByRole('button', { name: 'Paste a message' }))
    const message = 'Bishop Okafor arrives Wed on EK783 with his wife. Rev Chidi may also join later.'
    await user.type(screen.getByLabelText('Message'), message)
    await user.click(screen.getByRole('button', { name: 'Read message' }))

    expect(await screen.findByText('Suggested')).toBeInTheDocument()
    expect(screen.getByText('EK783')).toBeInTheDocument()
    expect(screen.getByText('Names of 1 person')).toBeInTheDocument()
    expect(screen.getByText('Rev Chidi may also join later.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Create draft' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/intake/s-9'))
    const createCall = fetchMock.mock.calls.findIndex(([url, init]) => String(url) === '/api/intake/submissions' && init?.method === 'POST')
    expect(sentBody(fetchMock, createCall)).toEqual({ text: message })
  })
})
