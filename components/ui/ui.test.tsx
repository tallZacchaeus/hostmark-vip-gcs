import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FormDialog } from './FormDialog'
import { Modal } from './Modal'
import { ToastProvider, useToast } from './Toast'

describe('Modal', () => {
  it('moves focus inside, closes on Escape and on the scrim, and restores focus', async () => {
    const onClose = vi.fn()
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    const { container, unmount } = render(
      <Modal onClose={onClose} scrimClassName="scrim" className="panel" label="Example">
        <button type="button">First</button>
        <button type="button">Last</button>
      </Modal>,
    )
    expect(screen.getByRole('dialog', { name: 'Example' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('First')).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(container.querySelector('.scrim') as Element)
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByText('Last'))
    expect(onClose).toHaveBeenCalledTimes(2)

    unmount()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })

  it('keeps Tab inside the dialog', async () => {
    render(
      <Modal onClose={vi.fn()} scrimClassName="scrim" className="panel" label="Trap">
        <button type="button">First</button>
        <button type="button">Last</button>
      </Modal>,
    )
    screen.getByText('Last').focus()
    await userEvent.tab()
    expect(screen.getByText('First')).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(screen.getByText('Last')).toHaveFocus()
  })
})

describe('FormDialog', () => {
  it('submits on Enter only when allowed and shows errors', async () => {
    const onSubmit = vi.fn()
    const { rerender } = render(
      <FormDialog title="Add room" submitLabel="Save" onSubmit={onSubmit} onClose={vi.fn()} canSubmit={false} error="Room number is taken">
        <input aria-label="Number" />
      </FormDialog>,
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Room number is taken')
    await userEvent.type(screen.getByLabelText('Number'), '412{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()

    rerender(
      <FormDialog title="Add room" submitLabel="Save" onSubmit={onSubmit} onClose={vi.fn()}>
        <input aria-label="Number" />
      </FormDialog>,
    )
    await userEvent.type(screen.getByLabelText('Number'), '{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('keeps the button pressable and says what is missing instead of silently refusing', async () => {
    // Arrange
    const onSubmit = vi.fn()
    const { rerender } = render(
      <FormDialog title="Add item" submitLabel="Save" onSubmit={onSubmit} onClose={vi.fn()} missing={['Enter a title', 'Enter a venue']}>
        <input aria-label="Title" />
      </FormDialog>,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    // Assert
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a title')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a venue')

    // Once everything is filled in, the message goes and saving works.
    rerender(
      <FormDialog title="Add item" submitLabel="Save" onSubmit={onSubmit} onClose={vi.fn()} missing={[]}>
        <input aria-label="Title" />
      </FormDialog>,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})

function ToastTrigger({ run }: { readonly run: () => void }) {
  const toast = useToast()
  return (
    <button type="button" onClick={() => toast.show({ message: 'Driver assigned.', action: { label: 'Undo', run } })}>
      Show
    </button>
  )
}

describe('Toast', () => {
  it('announces the message, runs its action once and closes after 10 seconds', () => {
    vi.useFakeTimers()
    const run = vi.fn()
    render(
      <ToastProvider>
        <ToastTrigger run={run} />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('Show'))
    expect(screen.getByRole('status')).toHaveTextContent('Driver assigned.')

    fireEvent.click(screen.getByText('Undo'))
    expect(run).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Driver assigned.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Show'))
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(screen.queryByText('Driver assigned.')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})
