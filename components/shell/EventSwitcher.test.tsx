import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, sentBody } from '@/tests/support/api-mock'
import { renderWithApp, sessionFor } from '@/tests/support/render'
import { EventSwitcher } from './EventSwitcher'
import type { SessionValue } from './SessionContext'

const navigate = vi.hoisted(() => ({ to: vi.fn() }))
vi.mock('@/lib/client/navigate', () => ({ navigateTo: navigate.to }))

function sessionWith(events: SessionValue['events']): SessionValue {
  return { ...sessionFor('programme_manager'), events }
}

const SUMMIT = { id: 'e-1', name: 'Lagos Leadership Summit 2026', status: 'live', is_current: true } as const
const FORUM = { id: 'e-2', name: 'Abuja Investment Forum', status: 'draft', is_current: false } as const

describe('EventSwitcher', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    navigate.to.mockReset()
  })

  it('shows the event by name when the person works on only one', () => {
    // Arrange / Act
    renderWithApp(<EventSwitcher />, sessionWith([SUMMIT]))

    // Assert
    expect(screen.getByText('Lagos Leadership Summit 2026')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Switch event/ })).not.toBeInTheDocument()
  })

  it('switches to another event and reopens the home screen in it', async () => {
    // Arrange
    const fetchMock = mockApi([{ path: '/api/me/event', method: 'PUT', body: { event_id: 'e-2' } }])
    const user = userEvent.setup()
    renderWithApp(<EventSwitcher />, sessionWith([SUMMIT, FORUM]))

    // Act
    await user.click(screen.getByRole('button', { name: /Switch event/ }))
    expect(screen.getByRole('menuitemradio', { name: /Lagos Leadership Summit 2026/ })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('menuitemradio', { name: /Abuja Investment Forum/ }))

    // Assert
    await waitFor(() => expect(navigate.to).toHaveBeenCalledWith('/dashboard'))
    expect(sentBody(fetchMock, 0)).toEqual({ event_id: 'e-2' })
  })

  it('marks a draft or archived event so nobody mistakes it for the live one', async () => {
    // Arrange
    const user = userEvent.setup()
    renderWithApp(<EventSwitcher />, sessionWith([{ ...FORUM, is_current: true }, { ...SUMMIT, is_current: false }]))

    // Act
    await user.click(screen.getByRole('button', { name: /Switch event/ }))

    // Assert
    expect(screen.getByRole('button', { name: /Switch event/ })).toHaveTextContent('Draft')
    expect(screen.getByRole('menuitemradio', { name: /Lagos Leadership Summit 2026/ })).toHaveTextContent('Live')
  })
})
