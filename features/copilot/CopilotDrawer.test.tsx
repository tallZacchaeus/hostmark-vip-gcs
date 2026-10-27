import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CopilotReply } from '@/lib/copilot/engine'
import { mockApi, sentBody } from '@/tests/support/api-mock'
import { renderWithApp, sessionFor } from '@/tests/support/render'
import { CopilotDrawer } from './CopilotDrawer'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/dashboard' }))

const reply = (overrides: Partial<CopilotReply>): CopilotReply => ({
  conversation_id: 'c-1',
  intent: 'find_arrivals',
  answer: '2 parties arriving in the next 2 hours: Bishop Augustine Okafor (EK783, 14:25, 4 people) and Dr Ngozi Eze (16:30, 1 person).',
  citations: [{ label: 'Bishop Augustine Okafor', href: '/guests/d-1' }],
  proposal: null,
  latency_ms: 12,
  ...overrides,
})

describe('CopilotDrawer', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('answers a suggested question with links to the records used', async () => {
    const fetchMock = mockApi([{ path: '/api/copilot/chat', method: 'POST', body: reply({}) }])
    renderWithApp(<CopilotDrawer onClose={vi.fn()} />, sessionFor('coordinator'))
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Who arrives in the next 2 hours?' }))

    expect(await screen.findByText(/2 parties arriving in the next 2 hours/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bishop Augustine Okafor' })).toHaveAttribute('href', '/guests/d-1')
    expect(sentBody(fetchMock, 0)).toMatchObject({ message: 'Who arrives in the next 2 hours?', input_mode: 'text', transcript_original: null })
    // Browsers in tests have no speech recognition: the microphone is hidden, typing still works.
    expect(screen.queryByRole('button', { name: 'Hold to talk' })).not.toBeInTheDocument()
  })

  it('shows a prepared change as a card, and approves it only when asked', async () => {
    const fetchMock = mockApi([
      { path: '/api/proposals/p-1/approve', method: 'POST', body: { status: 'approved' } },
      {
        path: '/api/copilot/chat',
        method: 'POST',
        body: reply({ intent: 'add_note', answer: 'I have prepared this for your approval: Add a note to Dr Ngozi Eze. Nothing changes until you approve it.', citations: [], proposal: { id: 'p-1', title: 'Add a note to Dr Ngozi Eze', summary: '“Allergic to peanuts”' } }),
      },
    ])
    renderWithApp(<CopilotDrawer onClose={vi.fn()} />, sessionFor('coordinator'))
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: 'Ask or give an instruction' }), 'Add a note to Dr Eze: Allergic to peanuts{Enter}')
    const card = (await screen.findByText('Add a note to Dr Ngozi Eze', { selector: 'h3' })).closest('.copilot-suggestion') as HTMLElement
    expect(within(card).getByText('“Allergic to peanuts”')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/approve'))).toBe(false)

    await user.click(within(card).getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText('Approved: Add a note to Dr Ngozi Eze')).toBeInTheDocument()
  })

  it('says when live data cannot be reached, with Retry', async () => {
    mockApi([{ path: '/api/copilot/chat', method: 'POST', status: 500, body: { code: 'internal', message: 'Something went wrong' } }])
    renderWithApp(<CopilotDrawer onClose={vi.fn()} />, sessionFor('coordinator'))
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Which rooms need cleaning?' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
