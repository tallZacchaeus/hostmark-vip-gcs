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
})
