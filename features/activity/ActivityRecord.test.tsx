import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AuditEntry } from '@/lib/client/activity-format'
import { ActivityRecord } from './ActivityRecord'

const entry = (overrides: Partial<AuditEntry> = {}): AuditEntry => ({
  id: '42',
  occurred_at: '2026-10-28T10:20:00Z',
  actor_type: 'system',
  actor_id: null,
  actor_name: null,
  action: 'rooms.update',
  entity_type: 'rooms',
  entity_id: 'r1',
  before: { number: '412', out_of_service: false },
  after: { number: '412', out_of_service: true },
  reason: null,
  proposal_id: null,
  is_automatic: true,
  undoable: true,
  undo_of_audit_id: null,
  undone: false,
  ...overrides,
})

describe('ActivityRecord', () => {
  it('reads as a sentence with the time in the event zone and a link to the object', () => {
    render(<ActivityRecord entry={entry()} timeZone="Africa/Lagos" expanded={false} onToggle={vi.fn()} onUndo={vi.fn()} undoBusy={false} />)
    expect(screen.getByText('The system')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'room 412' })).toHaveAttribute('href', '/rooms')
    expect(screen.getByText('11:20')).toBeInTheDocument()
    expect(screen.getByText('AUTO')).toBeInTheDocument()
  })

  it('offers Undo for undoable automatic changes and reports the entry', async () => {
    const onUndo = vi.fn()
    const record = entry()
    render(<ActivityRecord entry={record} timeZone="UTC" expanded={false} onToggle={vi.fn()} onUndo={onUndo} undoBusy={false} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Undo' }))
    expect(onUndo).toHaveBeenCalledWith(record)
  })

  it('shows "Undone" instead of the button once undone, and no Undo for manual changes', () => {
    const { rerender } = render(
      <ActivityRecord entry={entry({ undone: true })} timeZone="UTC" expanded={false} onToggle={vi.fn()} onUndo={vi.fn()} undoBusy={false} />,
    )
    expect(screen.getByText('Undone')).toBeInTheDocument()
    rerender(
      <ActivityRecord
        entry={entry({ undoable: false, is_automatic: false, actor_type: 'user', actor_name: 'Tolu Adebayo' })}
        timeZone="UTC"
        expanded={false}
        onToggle={vi.fn()}
        onUndo={vi.fn()}
        undoBusy={false}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    expect(screen.getByText('Tolu Adebayo')).toBeInTheDocument()
  })

  it('lists the field changes when expanded', async () => {
    const onToggle = vi.fn()
    render(<ActivityRecord entry={entry()} timeZone="UTC" expanded onToggle={onToggle} onUndo={vi.fn()} undoBusy={false} />)
    expect(screen.getByText('Out of service')).toBeInTheDocument()
    expect(screen.getByText('No')).toBeInTheDocument()
    expect(screen.getByText('Yes')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Hide changes' }))
    expect(onToggle).toHaveBeenCalled()
  })
})
