import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithApp, sessionFor } from '@/tests/support/render'
import { notificationLook } from './NotificationsDrawer'
import { SimBadge } from './SimBanner'
import { Sidebar } from './Sidebar'

describe('Sidebar', () => {
  it('shows coordinators the whole console with the current page marked', () => {
    renderWithApp(<Sidebar open={false} onClose={() => undefined} counts={{ intake: 3 }} />)
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /Intake/ })).toHaveTextContent('3')
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('Event Coordinator')).toBeInTheDocument()
  })

  it('shows the programmes team only the programme', () => {
    renderWithApp(<Sidebar open={false} onClose={() => undefined} />, sessionFor('programs'))
    expect(screen.getByRole('link', { name: 'Programme' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
  })
})

describe('SimBadge', () => {
  it('marks simulated flight data and links admins to the setting', () => {
    renderWithApp(<SimBadge />, sessionFor('admin', 'simulated'))
    expect(screen.getByRole('link', { name: /Flight data is simulated/ })).toHaveAttribute('href', '/settings?tab=system')
  })

  it('is a plain note for coordinators and hidden with live data', () => {
    const { unmount } = renderWithApp(<SimBadge />, sessionFor('coordinator', 'simulated'))
    expect(screen.getByRole('note')).toHaveTextContent('Simulated')
    unmount()
    renderWithApp(<SimBadge />, sessionFor('admin', 'live'))
    expect(screen.queryByText('Simulated')).not.toBeInTheDocument()
  })
})

describe('notificationLook', () => {
  it('picks an icon and colour by subject', () => {
    expect(notificationLook({ kind: 'proposal_created', entity_type: 'proposals', priority: 'normal' })).toEqual({ icon: 'sparkle', tone: 'lilac' })
    expect(notificationLook({ kind: 'flight_delayed', entity_type: 'flights', priority: 'high' })).toEqual({ icon: 'plane', tone: 'amber' })
    expect(notificationLook({ kind: 'program_at_risk', entity_type: 'program_items', priority: 'high' })).toEqual({ icon: 'calendarClock', tone: 'red' })
    expect(notificationLook({ kind: 'room_needs_cleaning', entity_type: 'cleaning_tasks', priority: 'normal' })).toEqual({ icon: 'spray', tone: 'blue' })
    expect(notificationLook({ kind: 'other', entity_type: null, priority: 'high' })).toEqual({ icon: 'alert', tone: 'red' })
  })
})
