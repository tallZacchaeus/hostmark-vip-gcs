import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlanLineView, PlanView } from '@/lib/repositories/room-plan'
import { mockApi, sentBody } from '@/tests/support/api-mock'
import { renderWithApp } from '@/tests/support/render'
import { PlanScreen } from './PlanScreen'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/rooms/plan/plan-1' }))

const line = (id: string, overrides: Partial<PlanLineView>): PlanLineView => ({
  id,
  status: 'pending',
  error: null,
  guest: { id: `g-${id}`, name: `Guest ${id}`, role: 'Principal', delegation: 'Okafor delegation', is_principal: true },
  room: { id: `r-${id}`, number: `30${id}`, type: 'Suite', wing: 'West', floor: 3 },
  why: 'Suite for a principal',
  match: 'High',
  meets_all: true,
  preferences: [{ code: 'tier', status: 'met', text: 'Suite, as the category asks' }],
  ...overrides,
})

const plan = (overrides: Partial<PlanView>): PlanView => ({
  id: 'plan-1',
  status: 'pending',
  title: 'Room plan for 3 guests',
  created_at: '2026-10-27T09:00:00.000Z',
  decided_at: null,
  decided_by: null,
  satisfaction: 0.86,
  placed: 3,
  unplaced: 1,
  meets_all: 2,
  warnings: 1,
  unplaced_guests: [{ guest_id: 'g-9', name: 'Dr Ngozi Eze', delegation: 'Eze delegation', reason: 'No accessible room is free.' }],
  lines: [
    line('1', {}),
    line('2', {}),
    line('3', { match: 'Partial', meets_all: false, why: 'Next to principal', preferences: [{ code: 'proximity', status: 'partly', text: 'One floor from the principal' }] }),
  ],
  ...overrides,
})

describe('PlanScreen', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('summarises the plan and leaves warning lines unticked', async () => {
    mockApi([{ path: '/api/allocation/plans/plan-1', body: plan({}) }])
    renderWithApp(<PlanScreen planId="plan-1" />)

    expect(await screen.findByText('86%')).toBeInTheDocument()
    expect(screen.getByText('Suggested at 10:00 for 4 guests.')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('No room found for Dr Ngozi Eze. No accessible room is free.')
    expect(screen.getByRole('button', { name: 'Select Guest 1' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Select Guest 3' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Approve selected (2)' })).toBeEnabled()
  })

  it('explains a line on demand', async () => {
    mockApi([{ path: '/api/allocation/plans/plan-1', body: plan({}) }])
    renderWithApp(<PlanScreen planId="plan-1" />)

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Why room 303 for Guest 3' }))

    expect(screen.getByText('One floor from the principal')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'View guest' })[0]).toHaveAttribute('href', '/guests/g-3')
  })

  it('approves only the chosen lines and reports what was applied', async () => {
    const fetchMock = mockApi([
      { path: '/api/allocation/plans/plan-1', body: plan({}) },
      { path: '/api/proposals/plan-1/approve', method: 'POST', body: { status: 'approved', applied: 1, failed: 0 } },
    ])
    renderWithApp(<PlanScreen planId="plan-1" />)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Select Guest 2' }))
    await user.click(screen.getByRole('button', { name: 'Approve selected (1)' }))

    expect(await screen.findByText('Plan approved. 1 room assigned.')).toBeInTheDocument()
    const index = fetchMock.mock.calls.findIndex(([url]) => String(url).endsWith('/approve'))
    expect(sentBody(fetchMock, index)).toEqual({ line_ids: ['1'] })
  })

  it('rejects the whole plan', async () => {
    const fetchMock = mockApi([
      { path: '/api/allocation/plans/plan-1', body: plan({}) },
      { path: '/api/proposals/plan-1/reject', method: 'POST', body: { status: 'rejected' } },
    ])
    renderWithApp(<PlanScreen planId="plan-1" />)

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Reject plan' }))

    expect(await screen.findByText('Plan rejected. Nothing was changed.')).toBeInTheDocument()
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/reject'))).toBe(true))
  })

  it('shows the outcome of a decided plan instead of the buttons', async () => {
    mockApi([
      {
        path: '/api/allocation/plans/plan-1',
        body: plan({ status: 'approved', decided_by: 'Ada Nwosu', decided_at: '2026-10-27T09:30:00.000Z', lines: [line('1', { status: 'approved' }), line('2', { status: 'failed', error: 'room_occupied' })] }),
      },
    ])
    renderWithApp(<PlanScreen planId="plan-1" />)

    expect(await screen.findByText(/Plan approved by Ada Nwosu · 10:30\. 1 room assigned\./)).toBeInTheDocument()
    expect(screen.getByText('Not applied')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument()
  })

  it('folds long plans and opens every line on request', async () => {
    const lines = Array.from({ length: 10 }, (_, index) => line(String(index + 1), {}))
    mockApi([{ path: '/api/allocation/plans/plan-1', body: plan({ lines, placed: 10, unplaced: 0, unplaced_guests: [] }) }])
    renderWithApp(<PlanScreen planId="plan-1" />)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Show 2 more lines' }))
    expect(screen.getByRole('button', { name: 'Select Guest 10' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show fewer lines' }))
    expect(screen.queryByRole('button', { name: 'Select Guest 10' })).not.toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('selects every line, then none, and back', async () => {
    mockApi([{ path: '/api/allocation/plans/plan-1', body: plan({}) }])
    renderWithApp(<PlanScreen planId="plan-1" />)
    const user = userEvent.setup()
    const selectAll = await screen.findByRole('button', { name: 'Select all lines' })

    await user.click(selectAll)
    expect(screen.getByRole('button', { name: 'Approve selected (3)' })).toBeEnabled()
    await user.click(selectAll)
    expect(screen.getByRole('button', { name: 'Approve selected (0)' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Select Guest 3' }))
    expect(screen.getByRole('button', { name: 'Select Guest 3' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Approve selected (1)' })).toBeEnabled()
  })

  it('approves everything and says how many lines could not be applied', async () => {
    const fetchMock = mockApi([
      { path: '/api/allocation/plans/plan-1', body: plan({}) },
      { path: '/api/proposals/plan-1/approve', method: 'POST', body: { status: 'approved', applied: 2, failed: 1 } },
    ])
    renderWithApp(<PlanScreen planId="plan-1" />)

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Approve all 3' }))

    expect(await screen.findByText('Plan approved. 2 rooms assigned. 1 line could not be applied.')).toBeInTheDocument()
    const index = fetchMock.mock.calls.findIndex(([url]) => String(url).endsWith('/approve'))
    expect(sentBody(fetchMock, index)).toEqual({})
  })

  it('reports a decision the server refuses', async () => {
    mockApi([
      { path: '/api/allocation/plans/plan-1', body: plan({}) },
      { path: '/api/proposals/plan-1/approve', method: 'POST', status: 409, body: { code: 'conflict', message: 'This plan was already decided' } },
    ])
    renderWithApp(<PlanScreen planId="plan-1" />)

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Approve all 3' }))
    expect(await screen.findByText('This plan was already decided')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve all 3' })).toBeEnabled()
  })

  it('shows a rejected plan with each line result', async () => {
    mockApi([
      {
        path: '/api/allocation/plans/plan-1',
        body: plan({
          status: 'rejected',
          unplaced_guests: [{ guest_id: 'g-9', name: 'Dr Ngozi Eze', delegation: 'Eze delegation', reason: null }],
          lines: [line('1', { status: 'rejected' }), line('2', { status: 'superseded' }), line('3', { status: 'expired' }), line('4', { status: 'mystery' as never })],
        }),
      },
    ])
    renderWithApp(<PlanScreen planId="plan-1" />)

    expect(await screen.findByText('Plan rejected. Nothing was changed.')).toBeInTheDocument()
    expect(screen.getByText('Result')).toBeInTheDocument()
    expect(screen.getByText('Not chosen')).toBeInTheDocument()
    expect(screen.getByText('Replaced')).toBeInTheDocument()
    expect(screen.getByText('Expired')).toBeInTheDocument()
    expect(screen.getByText('mystery')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('No room found for Dr Ngozi Eze. Free a room or assign by hand from the guest profile.')
    expect(screen.queryByText('Suggested')).not.toBeInTheDocument()
  })

  it('says when a plan was replaced by a newer one', async () => {
    mockApi([{ path: '/api/allocation/plans/plan-1', body: plan({ status: 'superseded' }) }])
    renderWithApp(<PlanScreen planId="plan-1" />)
    expect(await screen.findByText('This plan was replaced by a newer one. Run the allocator again from Rooms.')).toBeInTheDocument()
  })

  it('shows an approval without a recorded approver or time', async () => {
    mockApi([{ path: '/api/allocation/plans/plan-1', body: plan({ status: 'approved', lines: [line('1', { status: 'rejected' })] }) }])
    renderWithApp(<PlanScreen planId="plan-1" />)
    expect(await screen.findByText(/^Plan approved\. 0 rooms assigned\.$/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Rooms' })).toHaveAttribute('href', '/rooms')
  })

  it('explains why a line could not be applied, with every missed preference', async () => {
    mockApi([
      {
        path: '/api/allocation/plans/plan-1',
        body: plan({
          status: 'approved',
          lines: [
            line('1', {
              status: 'failed',
              error: 'room_occupied',
              match: 'Low',
              meets_all: false,
              preferences: [{ code: 'accessible', status: 'missed', text: 'Not an accessible room' }],
            }),
          ],
        }),
      },
    ])
    renderWithApp(<PlanScreen planId="plan-1" />)

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Why room 301 for Guest 1' }))
    expect(screen.getByText('Not an accessible room')).toBeInTheDocument()
    expect(screen.getByText('Someone else now has that room at that time.')).toBeInTheDocument()
    expect(screen.getByText('Low')).toBeInTheDocument()
    expect(screen.getByText('Warning')).toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Why room 301 for Guest 1' }))
    expect(screen.queryByText('Not an accessible room')).not.toBeInTheDocument()
  })

  it('shows a load failure with Retry', async () => {
    mockApi([{ path: '/api/allocation/plans/plan-1', status: 404, body: { code: 'not_found', message: 'Plan not found' } }])
    renderWithApp(<PlanScreen planId="plan-1" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Plan not found')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })
})
