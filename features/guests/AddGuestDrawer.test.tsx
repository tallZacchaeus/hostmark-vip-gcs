import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, sentBody } from '@/tests/support/api-mock'
import { renderWithApp } from '@/tests/support/render'
import { AddGuestDrawer } from './AddGuestDrawer'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/guests' }))

async function fillPickupGuest(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Full name'), 'Ngozi Eze')
  await user.type(screen.getByLabelText('Contact person'), 'Ngozi Eze')
  await user.type(screen.getByLabelText('Contact phone'), '+2348030000002')
  await user.selectOptions(screen.getByLabelText('Arrival mode'), 'pickup')
  await user.type(screen.getByLabelText('Pickup location'), 'Victoria Island')
  await user.type(screen.getByLabelText('Arrival date'), '2026-10-28')
  await user.type(screen.getByLabelText('Pickup time'), '16:30')
  await user.type(screen.getByLabelText('Departure date'), '2026-10-31')
}

describe('AddGuestDrawer', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    push.mockReset()
  })

  it('warns about a possible duplicate and adds the guest only when asked again', async () => {
    const duplicate = { code: 'possible_duplicate', message: 'A delegation with similar details already exists', details: { delegation_id: 'd-7' } }
    const fetchMock = mockApi([{ path: '/api/guests', method: 'POST', body: duplicate, status: 409 }])
    const user = userEvent.setup()
    renderWithApp(<AddGuestDrawer categories={[{ id: 'c-1', name: 'Dignitary', rank: 3 } as never]} onClose={vi.fn()} />)
    await fillPickupGuest(user)
    await user.selectOptions(screen.getByLabelText('VIP category'), 'c-1')
    await user.click(screen.getByRole('button', { name: 'Save guest' }))

    expect(await screen.findByRole('link', { name: 'Open it' })).toHaveAttribute('href', '/guests/d-7')
    expect(sentBody(fetchMock, 0)).toMatchObject({ vip_category_id: 'c-1', allow_duplicate: false, fields: { full_name: 'Ngozi Eze', arrival_mode: 'pickup' } })

    mockApi([{ path: '/api/guests', method: 'POST', body: { principal_guest_id: 'g-9' }, status: 201 }])
    await user.click(screen.getByRole('button', { name: 'Add anyway' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/guests/g-9'))
  })

  it('marks the fields the server says are missing', async () => {
    const incomplete = { code: 'intake_incomplete', message: 'Fix the highlighted fields first', details: [{ code: 'missing_departure_date', field: 'departure_date', severity: 'error', message: 'Enter the departure date' }] }
    mockApi([{ path: '/api/guests', method: 'POST', body: incomplete, status: 400 }])
    const user = userEvent.setup()
    renderWithApp(<AddGuestDrawer categories={[]} onClose={vi.fn()} />)
    await user.type(screen.getByLabelText('Full name'), 'Ngozi Eze')
    await user.click(screen.getByRole('button', { name: 'Save guest' }))

    expect(await screen.findByText('Enter the departure date')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Fix the highlighted fields first')
  })
})
