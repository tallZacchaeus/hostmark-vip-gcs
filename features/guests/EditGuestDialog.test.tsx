import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VipCategory } from '@/features/settings/types'
import { mockApi } from '@/tests/support/api-mock'
import { requestsTo } from '@/tests/support/fetch-calls'
import { renderWithApp } from '@/tests/support/render'
import { EditGuestDialog } from './EditGuestDialog'
import type { GuestProfile } from './types'

type Guest = GuestProfile['guest']

const guest = (overrides: Partial<Guest> = {}): Guest => ({
  id: 'g-1',
  delegation_id: 'd-1',
  title: 'Bishop',
  full_name: 'Augustine Okafor',
  member_role: 'principal',
  is_placeholder: false,
  status: 'expected',
  dietary: ['Vegetarian', 'No nuts'],
  accessibility: 'Step-free access',
  category_name: 'Clergy',
  vip_category_id: 'c-2',
  organisation: 'Diocese of Lagos West',
  position: null,
  proximity_priority: 'normal',
  share_group: 'Okafor couple',
  notes: 'Prefers a quiet floor',
  expected_departure_at: null,
  version: 3,
  ...overrides,
})

const categories: VipCategory[] = [
  { id: 'c-1', name: 'Head of State', rank: 1, preferred_room_tier: 1 },
  { id: 'c-2', name: 'Clergy', rank: 2, preferred_room_tier: 2 },
]

function open(target: Guest, status = 200, body: unknown = { id: target.id }) {
  const fetchMock = mockApi([{ path: `/api/guests/${target.id}`, method: 'PATCH', status, body }])
  const onSaved = vi.fn()
  const onClose = vi.fn()
  renderWithApp(<EditGuestDialog guest={target} categories={categories} onClose={onClose} onSaved={onSaved} />)
  return { fetchMock, onSaved, onClose, dialog: screen.getByRole('dialog', { name: 'Edit guest' }), user: userEvent.setup() }
}

describe('EditGuestDialog', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saves coordinator-only details with the version that was read', async () => {
    const { fetchMock, onSaved, dialog, user } = open(guest())
    expect(within(dialog).getByLabelText(/^Dietary/)).toHaveValue('Vegetarian, No nuts')

    await user.selectOptions(within(dialog).getByLabelText(/^VIP category/), 'c-1')
    await user.selectOptions(within(dialog).getByLabelText(/^Proximity priority/), 'high')
    const dietary = within(dialog).getByLabelText(/^Dietary/)
    await user.clear(dietary)
    await user.type(dietary, 'Halal, , low salt ')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(requestsTo(fetchMock, 'PATCH', '/api/guests/g-1')[0]?.body).toEqual({
      version: 3,
      title: 'Bishop',
      full_name: 'Augustine Okafor',
      organisation: 'Diocese of Lagos West',
      vip_category_id: 'c-1',
      proximity_priority: 'high',
      share_group: 'Okafor couple',
      dietary: ['Halal', 'low salt'],
      accessibility: 'Step-free access',
      notes: 'Prefers a quiet floor',
    })
  })

  it('needs a name for the principal', async () => {
    const { dialog, user } = open(guest())
    await user.clear(within(dialog).getByLabelText(/^Full name/))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter the guest’s full name')
  })

  it('lets a placeholder companion stay unnamed and clears an unset category', async () => {
    const companion = guest({
      id: 'g-2',
      title: null,
      full_name: null,
      member_role: 'security',
      is_placeholder: true,
      dietary: [],
      accessibility: null,
      vip_category_id: null,
      organisation: null,
      share_group: null,
      notes: null,
    })
    const { fetchMock, onSaved, dialog, user } = open(companion)
    await user.type(within(dialog).getByLabelText('Notes'), 'Travels with the principal')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(requestsTo(fetchMock, 'PATCH', '/api/guests/g-2')[0]?.body).toEqual({
      version: 3,
      title: '',
      organisation: '',
      vip_category_id: null,
      proximity_priority: 'normal',
      share_group: '',
      dietary: [],
      accessibility: '',
      notes: 'Travels with the principal',
    })
  })

  it('shows a conflicting edit and keeps the dialog open', async () => {
    const { onSaved, dialog, user } = open(guest(), 409, { code: 'version_conflict', message: 'Someone else changed this guest. Reload to see their changes.' })
    await user.type(within(dialog).getByLabelText(/^Position or organisation/), ' (Anglican)')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Someone else changed this guest. Reload to see their changes.')
    expect(onSaved).not.toHaveBeenCalled()
  })
})
