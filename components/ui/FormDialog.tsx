'use client'
// The design's settings dialog as a form: title, fields, an inline error, Cancel and a submit
// button. Enter submits; Escape and the scrim cancel (Modal). Forms with required fields pass
// `missing` instead of disabling the button: pressing it then says what is still needed, rather
// than leaving a greyed-out button with no reason (tester feedback, Nov 2026).
import { type FormEvent, type ReactNode, useId, useState } from 'react'
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
  /** False keeps the button disabled (confirmations, nothing changed yet). */
  readonly canSubmit?: boolean
  /** What still has to be filled in, one short instruction each ("Enter a venue"); shown on submit. */
  readonly missing?: readonly string[]
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
  missing = [],
  danger = false,
  width = 'wide',
  children,
}: FormDialogProps) {
  const titleId = useId()
  const [triedSubmit, setTriedSubmit] = useState(false)
  const showMissing = triedSubmit && missing.length > 0
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit || busy) return
    if (missing.length > 0) {
      setTriedSubmit(true)
      return
    }
    onSubmit()
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
        {showMissing ? (
          <div className="form-error" role="alert">
            <Icon name="alert" size={16} />
            <div>
              <span>Before saving:</span>
              <ul>
                {missing.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
        {error && !showMissing && (
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

/** The messages for requirements not yet met: `unmet([[title !== '', 'Enter a title']])`. */
export function unmet(checks: ReadonlyArray<readonly [boolean, string]>): string[] {
  return checks.filter(([met]) => !met).map(([, message]) => message)
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
