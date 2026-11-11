import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, sentBody } from '@/tests/support/api-mock'
import { participant, programItem, programmeView } from '@/tests/support/programme'
import { renderWithApp, sessionFor } from '@/tests/support/render'
import { ProgrammeScreen } from './ProgrammeScreen'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/programme' }))

const atRisk = programItem({ at_risk: true, state: 'risk', participants: [participant({ late: true })] })

describe('ProgrammeScreen', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the coordinator the timeline with the at-risk item open, and lets them alert the programs team', async () => {
    const fetchMock = mockApi([
      { path: '/api/program-items/p-1/notify', method: 'POST', body: { id: 'p-1' } },
      {
        path: '/api/programme',
        body: programmeView({
          at_risk_count: 1,
          venues: [{ name: 'Conference hall A', count: 1 }, { name: 'Banquet hall', count: 1 }],
          items: [programItem({ id: 'p-0', title: 'Delegates’ lunch', starts_at: '2026-10-28T11:30:00.000Z', ends_at: '2026-10-28T12:30:00.000Z', state: 'done', location: 'Banquet hall' }), atRisk],
        }),
      },
    ])
    renderWithApp(<ProgrammeScreen />, sessionFor('coordinator'))
    const user = userEvent.setup()

    expect(await screen.findByText('Bishop Augustine Okafor (Cat. 1) is expected at the venue at 16:55. Welcome briefing starts at 17:00.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open guest' })).toHaveAttribute('href', '/guests/d-1')
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByText('Item affected by arrivals on this day')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add item' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit item' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Notify programme team' }))
    expect(await screen.findByText('Programme team notified.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/p-1/notify'))).toBe(true)
  })

  it('lets the programs team add an item with a participant', async () => {
    const fetchMock = mockApi([
      { path: '/api/program-items/p-9/participants', method: 'PUT', body: { count: 1 } },
      { path: '/api/program-items', method: 'POST', body: { id: 'p-9' } },
      { path: '/api/programme/guests', body: [{ id: 'g-1', name: 'Bishop Augustine Okafor', delegation: 'Okafor', category: 'Cat. 1' }] },
      { path: '/api/programme', body: programmeView({ can_edit: true }) },
    ])
    renderWithApp(<ProgrammeScreen />, sessionFor('programs'))
    const user = userEvent.setup()

    expect(await screen.findByText('No items on this day.')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Add item' })[0] as HTMLElement)
    const dialog = screen.getByRole('dialog', { name: 'Add programme item' })
    await user.type(within(dialog).getByRole('textbox', { name: /^Title/ }), 'Opening dinner')
    await user.type(within(dialog).getByRole('combobox', { name: /^Venue/ }), 'Banquet hall')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Status' }), 'published')
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Bishop Augustine Okafor · Cat. 1' })).toBeInTheDocument())
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Guest to add' }), 'g-1')
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))
    await user.click(within(dialog).getByRole('button', { name: 'Add item' }))

    expect(await screen.findByText('Programme item added.')).toBeInTheDocument()
    const postIndex = fetchMock.mock.calls.findIndex(([url, init]) => String(url).endsWith('/api/program-items') && init?.method === 'POST')
    expect(sentBody(fetchMock, postIndex)).toMatchObject({ title: 'Opening dinner', location: 'Banquet hall', status: 'published', starts_at: '2026-10-28T08:00:00.000Z' })
    const putIndex = fetchMock.mock.calls.findIndex(([url]) => String(url).endsWith('/participants'))
    expect(sentBody(fetchMock, putIndex)).toEqual({ participants: [{ guest_id: 'g-1', role: 'speaker' }] })
  })

  it('tells the editor which fields are missing when they try to add an incomplete item', async () => {
    // Arrange
    const fetchMock = mockApi([
      { path: '/api/programme/guests', body: [] },
      { path: '/api/programme', body: programmeView({ can_edit: true }) },
    ])
    renderWithApp(<ProgrammeScreen />, sessionFor('programs'))
    const user = userEvent.setup()
    await user.click((await screen.findAllByRole('button', { name: 'Add item' }))[0] as HTMLElement)
    const dialog = screen.getByRole('dialog', { name: 'Add programme item' })

    // Act
    await user.type(within(dialog).getByRole('textbox', { name: /^Title/ }), 'Opening dinner')
    await user.click(within(dialog).getByRole('button', { name: 'Add item' }))

    // Assert
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter a venue')
    expect(within(dialog).getByRole('alert')).not.toHaveTextContent('Enter a title')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('opens an item to show participants and lets editors edit drafts', async () => {
    mockApi([
      { path: '/api/programme/guests', body: [] },
      { path: '/api/programme', body: programmeView({ can_edit: true, items: [programItem({ status: 'draft', participants: [participant({ arrived: true })] })] }) },
    ])
    renderWithApp(<ProgrammeScreen />, sessionFor('programs'))
    const user = userEvent.setup()

    expect(await screen.findByText('Draft')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Welcome briefing/ }))
    expect(within(screen.getByRole('list', { name: 'Participants' })).getByText(/arrived/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit item' }))
    expect(screen.getByRole('dialog', { name: 'Edit programme item' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^Title/ })).toHaveValue('Welcome briefing')
  })

  it('shows items left outside the event days under a note, and keeps their day when editing', async () => {
    const stranded = programItem({ id: 'p-5', title: 'Farewell brunch', starts_at: '2026-10-31T09:00:00.000Z', ends_at: '2026-10-31T10:00:00.000Z' })
    mockApi([
      { path: '/api/programme/guests', body: [] },
      { path: '/api/programme?day=2026-10-31', body: programmeView({ can_edit: true, day: '2026-10-31', outside_days: ['2026-10-31'], items: [stranded] }) },
      { path: '/api/programme', body: programmeView({ can_edit: true, outside_days: ['2026-10-31'] }) },
    ])
    renderWithApp(<ProgrammeScreen />, sessionFor('programs'))
    const user = userEvent.setup()

    const note = await screen.findByRole('note', { name: 'Outside the event days' })
    await user.click(within(note).getByRole('button', { name: /31 Oct/ }))
    expect(await screen.findByText('Farewell brunch')).toBeInTheDocument()
    expect(screen.getByText('This day is outside the event days. Move these items onto an event day, or cancel them.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Farewell brunch/ }))
    await user.click(screen.getByRole('button', { name: 'Edit item' }))
    const daySelect = within(screen.getByRole('dialog', { name: 'Edit programme item' })).getByRole('combobox', { name: 'Day' })
    expect(daySelect).toHaveValue('2026-10-31')
    expect(within(daySelect).getByRole('option', { name: /outside the event days/ })).toBeInTheDocument()
  })

  it('tells coordinators when nothing is published for the day', async () => {
    mockApi([{ path: '/api/programme', body: programmeView({}) }])
    renderWithApp(<ProgrammeScreen />, sessionFor('coordinator'))

    expect(await screen.findByText('Nothing published for this day yet.')).toBeInTheDocument()
  })
})
