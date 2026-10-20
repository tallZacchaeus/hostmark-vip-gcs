'use client'
// "What was read", editable (FR-IN-10): every intake field, marked where a check found a problem,
// plus the companions. Used by the review screen and by "Add guest".
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { ARRIVAL_MODES, MAX_PARTY_SIZE, PARTY_ROLES } from '@/lib/domain/intake/schema'
import { ARRIVAL_MODE_LABELS, EMPTY_MEMBER, type IntakeFields, PARTY_ROLE_LABELS, type PartyMember } from './model'

type Messages = Partial<Record<string, string>>

interface FieldProps {
  readonly label: string
  readonly name: string
  readonly messages: Messages
  readonly children: ReactNode
}

function ReviewField({ label, name, messages, children }: FieldProps) {
  const message = messages[name]
  return (
    <div>
      <label className={`review-field ${message ? 'is-missing' : ''}`}>
        <span>
          {label}
          {message && <span className="missing-chip">Check</span>}
        </span>
        {children}
      </label>
      {message && (
        <small role="note">
          <Icon name="alert" size={14} />
          {message}
        </small>
      )}
    </div>
  )
}

export interface ReviewFormProps {
  readonly fields: IntakeFields
  readonly onChange: (fields: IntakeFields) => void
  readonly messages: Messages
  readonly readOnly?: boolean
}

export function ReviewForm({ fields, onChange, messages, readOnly = false }: ReviewFormProps) {
  const set = <K extends keyof IntakeFields>(name: K, value: IntakeFields[K]) => onChange({ ...fields, [name]: value })
  const text = (name: keyof IntakeFields & string, type = 'text') => (
    <input type={type} value={String(fields[name] ?? '')} onChange={(event) => set(name, event.target.value as never)} readOnly={readOnly} aria-invalid={Boolean(messages[name])} />
  )
  const setMember = (index: number, change: Partial<PartyMember>) => set('party', fields.party.map((member, at) => (at === index ? { ...member, ...change } : member)))
  const mode = fields.arrival_mode

  return (
    <>
      <div className="review-base-fields">
        <ReviewField label="Title" name="title" messages={messages}>{text('title')}</ReviewField>
        <ReviewField label="Full name" name="full_name" messages={messages}>{text('full_name')}</ReviewField>
        <ReviewField label="Position or organisation" name="organisation" messages={messages}>{text('organisation')}</ReviewField>
        <ReviewField label="Contact person" name="contact_name" messages={messages}>{text('contact_name')}</ReviewField>
        <ReviewField label="Contact email" name="contact_email" messages={messages}>{text('contact_email', 'email')}</ReviewField>
        <ReviewField label="Contact phone" name="contact_phone" messages={messages}>{text('contact_phone', 'tel')}</ReviewField>
        <ReviewField label="Arrival mode" name="arrival_mode" messages={messages}>
          <select value={mode ?? ''} onChange={(event) => set('arrival_mode', (event.target.value || undefined) as IntakeFields['arrival_mode'])} disabled={readOnly}>
            <option value="">Not stated</option>
            {ARRIVAL_MODES.map((value) => (
              <option key={value} value={value}>
                {ARRIVAL_MODE_LABELS[value]}
              </option>
            ))}
          </select>
        </ReviewField>
        {mode === 'flying' && (
          <>
            <ReviewField label="Airline" name="airline" messages={messages}>{text('airline')}</ReviewField>
            <ReviewField label="Flight number" name="flight_number" messages={messages}>{text('flight_number')}</ReviewField>
          </>
        )}
        {mode === 'pickup' && <ReviewField label="Pickup location" name="pickup_address" messages={messages}>{text('pickup_address')}</ReviewField>}
        <ReviewField label="Arrival date" name="arrival_date" messages={messages}>{text('arrival_date', 'date')}</ReviewField>
        <ReviewField label={mode === 'pickup' ? 'Pickup time' : 'Arrival time'} name="arrival_time" messages={messages}>{text('arrival_time', 'time')}</ReviewField>
        <ReviewField label="Departure date" name="departure_date" messages={messages}>{text('departure_date', 'date')}</ReviewField>
        <ReviewField label="Dietary" name="dietary" messages={messages}>{text('dietary')}</ReviewField>
        <ReviewField label="Accessibility" name="accessibility" messages={messages}>{text('accessibility')}</ReviewField>
      </div>
      <section className="companions-section" aria-labelledby="companions-title">
        <h3 id="companions-title">Companions ({fields.party.length})</h3>
        {messages.party && <p className="name-missing">{messages.party}</p>}
        {fields.party.map((member, index) => (
          <div key={index}>
            <label>
              <span>{PARTY_ROLE_LABELS[member.role]}</span>
              <input value={member.name} onChange={(event) => setMember(index, { name: event.target.value })} placeholder="Enter name" readOnly={readOnly} aria-label={`Companion ${index + 1} name`} />
            </label>
            <span className="companion-actions">
              <select value={member.role} onChange={(event) => setMember(index, { role: event.target.value as PartyMember['role'] })} disabled={readOnly} aria-label={`Companion ${index + 1} role`}>
                {PARTY_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {PARTY_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
              {!readOnly && (
                <button type="button" className="icon-button" aria-label={`Remove companion ${index + 1}`} onClick={() => set('party', fields.party.filter((_, at) => at !== index))}>
                  <Icon name="trash" size={16} />
                </button>
              )}
            </span>
          </div>
        ))}
        {!readOnly && fields.party.length < MAX_PARTY_SIZE && (
          <Button icon="plus" kind="ghost" onClick={() => set('party', [...fields.party, EMPTY_MEMBER])}>
            Add companion
          </Button>
        )}
      </section>
    </>
  )
}
