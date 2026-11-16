'use client'
// "Request a demo" (landing page). Names what is missing instead of disabling the button, keeps
// what was typed when sending fails, and has a hidden "website" field that only bots fill in.
import { type FormEvent, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { apiSend, errorMessage } from '@/lib/client/api'
import { EVENT_SIZES, EVENT_SIZE_LABELS, MAX_DEMO_MESSAGE_LENGTH } from '@/lib/validation/demo-request'

interface Fields {
  readonly name: string
  readonly organisation: string
  readonly email: string
  readonly event_size: string
  readonly message: string
  readonly website: string
}

type FieldErrors = Partial<Record<'name' | 'organisation' | 'email', string>>

const EMPTY: Fields = { name: '', organisation: '', email: '', event_size: '', message: '', website: '' }
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function findProblems(fields: Fields): FieldErrors {
  const email = fields.email.trim()
  return {
    ...(fields.name.trim() ? {} : { name: 'Enter your name' }),
    ...(fields.organisation.trim() ? {} : { organisation: 'Enter your organisation' }),
    ...(!email ? { email: 'Enter your work email' } : EMAIL_SHAPE.test(email) ? {} : { email: 'Enter a valid email address' }),
  }
}

interface TextFieldProps {
  readonly id: keyof FieldErrors
  readonly label: string
  readonly type?: 'text' | 'email'
  readonly autoComplete: string
  readonly value: string
  readonly error?: string
  readonly onChange: (value: string) => void
}

function TextField({ id, label, type = 'text', autoComplete, value, error, onChange }: TextFieldProps) {
  const inputId = `demo-${id}`
  const errorId = `${inputId}-error`
  return (
    <div className={`lp-field${error ? ' has-error' : ''}`}>
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        name={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        maxLength={type === 'email' ? 200 : 150}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && (
        <small id={errorId} className="lp-field-error">
          {error}
        </small>
      )}
    </div>
  )
}

function ThankYou({ email }: { readonly email: string }) {
  return (
    <div className="lp-form-done" role="status">
      <span className="lp-form-done-icon">
        <Icon name="check" size={22} />
      </span>
      <h3>Thank you, we have your request</h3>
      <p>We will reply to {email} to arrange a walkthrough.</p>
    </div>
  )
}

export function DemoRequestForm() {
  const [fields, setFields] = useState<Fields>(EMPTY)
  const [problems, setProblems] = useState<FieldErrors>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const update = (key: keyof Fields) => (value: string) => setFields((current) => ({ ...current, [key]: value }))

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = findProblems(fields)
    setProblems(found)
    setFailure(null)
    if (Object.keys(found).length > 0) return
    setIsSending(true)
    try {
      await apiSend('/api/demo-requests', 'POST', fields)
      setSentTo(fields.email.trim())
    } catch (error: unknown) {
      setFailure(errorMessage(error))
    } finally {
      setIsSending(false)
    }
  }

  if (sentTo) return <ThankYou email={sentTo} />

  return (
    <form className="lp-form" noValidate onSubmit={handleSubmit}>
      <div className="lp-form-row">
        <TextField id="name" label="Your name" autoComplete="name" value={fields.name} error={problems.name} onChange={update('name')} />
        <TextField
          id="organisation"
          label="Organisation"
          autoComplete="organization"
          value={fields.organisation}
          error={problems.organisation}
          onChange={update('organisation')}
        />
      </div>
      <TextField id="email" label="Work email" type="email" autoComplete="email" value={fields.email} error={problems.email} onChange={update('email')} />
      <div className="lp-field">
        <label htmlFor="demo-event-size">
          How many VIP guests? <em>Optional</em>
        </label>
        <select id="demo-event-size" name="event_size" value={fields.event_size} onChange={(event) => update('event_size')(event.target.value)}>
          <option value="">Choose a size</option>
          {EVENT_SIZES.map((size) => (
            <option key={size} value={size}>
              {EVENT_SIZE_LABELS[size]}
            </option>
          ))}
        </select>
      </div>
      <div className="lp-field">
        <label htmlFor="demo-message">
          Anything we should know? <em>Optional</em>
        </label>
        <textarea
          id="demo-message"
          name="message"
          rows={4}
          maxLength={MAX_DEMO_MESSAGE_LENGTH}
          value={fields.message}
          placeholder="Your event, its dates, and what is hardest to coordinate today."
          onChange={(event) => update('message')(event.target.value)}
        />
      </div>
      <div className="lp-trap" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" value={fields.website} onChange={(event) => update('website')(event.target.value)} />
        </label>
      </div>
      {failure && (
        <p className="lp-form-failure" role="alert">
          <Icon name="alert" size={18} />
          {failure}
        </p>
      )}
      <button type="submit" className="lp-button lp-button--primary lp-button--block" aria-busy={isSending || undefined}>
        {isSending ? 'Sending…' : 'Request a demo'}
      </button>
      <p className="lp-form-note">We only use these details to reply to you. Nothing is added to a mailing list.</p>
    </form>
  )
}
