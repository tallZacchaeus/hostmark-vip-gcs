'use client'
// The design's settings dialog as a form: title, fields, an inline error, Cancel and a submit
// button. Enter submits; Escape and the scrim cancel (Modal).
import { type FormEvent, type ReactNode, useId } from 'react'
import { Button } from './Button'
import { Icon } from './Icon'
import { Modal } from './Modal'

interface FormDialogProps {
  readonly title: string
  readonly description?: ReactNode
  readonly submitLabel: string
  readonly onSubmit: () => void
  readonly onClose: () => void
  readonly busy?: boolean
  readonly error?: string | null
  readonly canSubmit?: boolean
  readonly danger?: boolean
  readonly width?: 'wide' | 'compact'
  readonly children?: ReactNode
}

export function FormDialog({
  title,
  description,
  submitLabel,
  onSubmit,
  onClose,
  busy = false,
  error,
  canSubmit = true,
  danger = false,
  width = 'wide',
  children,
}: FormDialogProps) {
  const titleId = useId()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (canSubmit && !busy) onSubmit()
  }
  return (
    <Modal
      onClose={onClose}
      scrimClassName="settings-dialog-scrim"
      className={`settings-dialog settings-dialog--${width}`}
      role={danger ? 'alertdialog' : 'dialog'}
      labelledBy={titleId}
    >
      <form onSubmit={submit} noValidate>
        <header>
          <h2 id={titleId}>{title}</h2>
          {description && <p>{description}</p>}
        </header>
        {children && <div className="settings-dialog-fields">{children}</div>}
        {error && (
          <p className="form-error" role="alert">
            <Icon name="alert" size={16} />
            {error}
          </p>
        )}
        <footer>
          <Button onClick={onClose}>Cancel</Button>
          <button type="submit" className={danger ? 'settings-danger' : 'settings-confirm'} disabled={!canSubmit || busy} aria-busy={busy || undefined}>
            {busy ? 'Working…' : submitLabel}
          </button>
        </footer>
      </form>
    </Modal>
  )
}

interface FieldProps {
  readonly label: string
  readonly children: ReactNode
  readonly hint?: string
  readonly required?: boolean
  readonly className?: string
}

/** A labelled control. Wrapping the control in <label> associates them without ids. */
export function Field({ label, children, hint, required, className = '' }: FieldProps) {
  return (
    <label className={`field ${className}`.trim()}>
      <span>
        {label}
        {required && <span aria-hidden="true"> *</span>}
        {required && <span className="visually-hidden"> (required)</span>}
      </span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}
