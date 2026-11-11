'use client'
// The four steps of the public registration form (Figma "Register your delegation"). Field rules
// come from the shared intake schema; the guest never chooses a VIP category (FR-IN-11).
import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'
import { ARRIVAL_MODE_LABELS, EMPTY_MEMBER, type IntakeFields, PARTY_ROLE_LABELS, type PartyMember, TITLES } from '@/features/intake/model'
import { formatDay } from '@/lib/client/format'
import { type ArrivalMode, MAX_PARTY_SIZE, PARTY_ROLES } from '@/lib/domain/intake/schema'
import type { TravelWindow } from '@/lib/domain/intake/travel-window'

export type Errors = Partial<Record<string, string>>
type SetField = <K extends keyof IntakeFields>(name: K, value: IntakeFields[K]) => void

interface FieldProps {
  readonly label: string
  readonly required?: boolean
  readonly error?: string
  readonly hint?: string
  readonly children: ReactNode
}

export function RegistrationField({ label, required, error, hint, children }: FieldProps) {
  return (
    <label className={`registration-field ${error ? 'has-error' : ''}`}>
      <span>
        {label}
        {required && <b aria-hidden="true">*</b>}
      </span>
      {children}
      {error ? (
        <small className="registration-error" role="alert">
          <Icon name="alert" size={14} />
          {error}
        </small>
      ) : hint ? (
        <small>{hint}</small>
      ) : null}
    </label>
  )
}

interface StepProps {
  readonly fields: IntakeFields
  readonly errors: Errors
  readonly setField: SetField
}

export function DelegationStep({ fields, errors, setField }: StepProps) {
  return (
    <div className="registration-fields">
      <RegistrationField label="Title" error={errors.title}>
        <select value={fields.title} onChange={(event) => setField('title', event.target.value)}>
          <option value="">Select title</option>
          {TITLES.map((title) => (
            <option key={title}>{title}</option>
          ))}
        </select>
      </RegistrationField>
      <RegistrationField label="Full name" required error={errors.full_name}>
        <input value={fields.full_name} onChange={(event) => setField('full_name', event.target.value)} placeholder="e.g. Augustine Okafor" autoComplete="name" required aria-invalid={Boolean(errors.full_name)} />
      </RegistrationField>
      <RegistrationField label="Position or organisation" error={errors.organisation}>
        <input value={fields.organisation} onChange={(event) => setField('organisation', event.target.value)} placeholder="e.g. Diocese of Lagos West" autoComplete="organization" />
      </RegistrationField>
      <RegistrationField label="Contact person name" required error={errors.contact_name} hint="Who we should talk to about this delegation.">
        <input value={fields.contact_name} onChange={(event) => setField('contact_name', event.target.value)} required aria-invalid={Boolean(errors.contact_name)} />
      </RegistrationField>
      <RegistrationField label="Contact email" error={errors.contact_email} hint="We confirm by email. Give an email or a phone number.">
        <input type="email" value={fields.contact_email} onChange={(event) => setField('contact_email', event.target.value)} autoComplete="email" aria-invalid={Boolean(errors.contact_email)} />
      </RegistrationField>
      <RegistrationField label="Contact phone" error={errors.contact_phone}>
        <input type="tel" value={fields.contact_phone} onChange={(event) => setField('contact_phone', event.target.value)} placeholder="+234 803 000 0000" autoComplete="tel" />
      </RegistrationField>
    </div>
  )
}

const MODE_ICONS: Readonly<Record<ArrivalMode, IconName>> = { flying: 'plane', own_transport: 'car', pickup: 'pin' }
const MODE_CHOICES: Readonly<Record<ArrivalMode, string>> = { flying: 'Flying', own_transport: 'Own transport', pickup: 'I need a pickup' }

interface ArrivalStepProps extends StepProps {
  /** Keeps the date pickers inside the event's travel dates. */
  readonly travelDates?: TravelWindow | null
}

export function ArrivalStep({ fields, errors, setField, travelDates = null }: ArrivalStepProps) {
  const mode = fields.arrival_mode
  const dateLimits = travelDates ? { min: travelDates.from, max: travelDates.to } : {}
  return (
    <div className="registration-fields">
      <fieldset className={`registration-field ${errors.arrival_mode ? 'has-error' : ''}`}>
        <legend>
          How are you arriving?<b aria-hidden="true">*</b>
        </legend>
        <div className="arrival-options">
          {(Object.keys(MODE_CHOICES) as ArrivalMode[]).map((value) => (
            <button type="button" key={value} className={mode === value ? 'is-selected' : ''} aria-pressed={mode === value} onClick={() => setField('arrival_mode', value)}>
              <Icon name={MODE_ICONS[value]} />
              <span>{MODE_CHOICES[value]}</span>
            </button>
          ))}
        </div>
        {errors.arrival_mode && (
          <small className="registration-error" role="alert">
            <Icon name="alert" size={14} />
            {errors.arrival_mode}
          </small>
        )}
      </fieldset>
      {mode === 'flying' && (
        <div className="registration-date-row">
          <RegistrationField label="Airline" required error={errors.airline}>
            <input value={fields.airline} onChange={(event) => setField('airline', event.target.value)} placeholder="e.g. Emirates" />
          </RegistrationField>
          <RegistrationField label="Flight number" required error={errors.flight_number}>
            <input value={fields.flight_number} onChange={(event) => setField('flight_number', event.target.value)} placeholder="e.g. EK783" autoCapitalize="characters" />
          </RegistrationField>
        </div>
      )}
      {mode === 'pickup' && (
        <RegistrationField label="Pickup location" required error={errors.pickup_address} hint="Where should we collect you?">
          <input value={fields.pickup_address} onChange={(event) => setField('pickup_address', event.target.value)} placeholder="e.g. Victoria Island, Lagos" />
        </RegistrationField>
      )}
      {mode && (
        <>
          <div className="registration-date-row">
            <RegistrationField label="Arrival date" required error={errors.arrival_date}>
              <input type="date" {...dateLimits} value={fields.arrival_date} onChange={(event) => setField('arrival_date', event.target.value)} />
            </RegistrationField>
            <RegistrationField
              label={mode === 'pickup' ? 'Pickup time' : mode === 'flying' ? 'Landing time' : 'Arrival time'}
              required={mode !== 'flying'}
              error={errors.arrival_time}
              hint={mode === 'flying' ? 'If you know it. We also track the flight.' : undefined}
            >
              <input type="time" value={fields.arrival_time} onChange={(event) => setField('arrival_time', event.target.value)} />
            </RegistrationField>
          </div>
          <RegistrationField label="Departure date" required error={errors.departure_date}>
            <input type="date" {...dateLimits} value={fields.departure_date} onChange={(event) => setField('departure_date', event.target.value)} />
          </RegistrationField>
        </>
      )}
    </div>
  )
}

interface PartyStepProps extends StepProps {
  readonly setParty: (party: PartyMember[]) => void
}

export function PartyStep({ fields, errors, setField, setParty }: PartyStepProps) {
  const party = fields.party
  const resize = (count: number) => setParty(Array.from({ length: count }, (_, index) => party[index] ?? EMPTY_MEMBER))
  const setMember = (index: number, change: Partial<PartyMember>) => setParty(party.map((member, at) => (at === index ? { ...member, ...change } : member)))
  return (
    <div className="registration-party">
      <div className="registration-fields">
        <RegistrationField label="Dietary needs" hint="Optional. For example: vegetarian, halal, no pork.">
          <input value={fields.dietary} onChange={(event) => setField('dietary', event.target.value)} />
        </RegistrationField>
        <RegistrationField label="Accessibility needs" hint="Optional. For example: wheelchair, ground floor, hearing loop.">
          <input value={fields.accessibility} onChange={(event) => setField('accessibility', event.target.value)} />
        </RegistrationField>
      </div>
      <div className="party-stepper">
        <div>
          <b id="party-count-label">How many guests are travelling with you?</b>
          <small>Not counting yourself. Up to {MAX_PARTY_SIZE}.</small>
        </div>
        <span role="group" aria-labelledby="party-count-label">
          <button type="button" disabled={party.length === 0} onClick={() => resize(party.length - 1)} aria-label="One fewer guest">
            −
          </button>
          <b aria-live="polite">{party.length}</b>
          <button type="button" disabled={party.length === MAX_PARTY_SIZE} onClick={() => resize(party.length + 1)} aria-label="One more guest">
            +
          </button>
        </span>
      </div>
      {party.map((member, index) => (
        <section className="party-guest-card" key={index} aria-labelledby={`guest-${index}-title`}>
          <header>
            <span aria-hidden="true">{index + 1}</span>
            <h3 id={`guest-${index}-title`}>Guest {index + 1}</h3>
          </header>
          <RegistrationField label="Name" hint="Leave blank if not confirmed yet." error={errors[`party.${index}.name`]}>
            <input value={member.name} onChange={(event) => setMember(index, { name: event.target.value })} />
          </RegistrationField>
          <RegistrationField label="Role" required error={errors[`party.${index}.role`]}>
            <select value={member.role} onChange={(event) => setMember(index, { role: event.target.value as PartyMember['role'] })}>
              {PARTY_ROLES.map((role) => (
                <option key={role} value={role}>
                  {PARTY_ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </RegistrationField>
          <RegistrationField label="Dietary needs">
            <input value={member.dietary} onChange={(event) => setMember(index, { dietary: event.target.value })} placeholder="Optional" />
          </RegistrationField>
          <RegistrationField label="Accessibility needs">
            <input value={member.accessibility} onChange={(event) => setMember(index, { accessibility: event.target.value })} placeholder="Optional" />
          </RegistrationField>
        </section>
      ))}
      <div className="registration-fields">
        <RegistrationField label="Anything else we should know?" error={errors.others} hint="Optional. Medical needs, security arrangements, people joining later, schedule changes.">
          <textarea value={fields.others} onChange={(event) => setField('others', event.target.value)} rows={4} maxLength={2000} />
        </RegistrationField>
      </div>
    </div>
  )
}

function ReviewCard({ title, step, onEdit, children }: { readonly title: string; readonly step: number; readonly onEdit: (step: number) => void; readonly children: ReactNode }) {
  return (
    <section className="registration-review-card">
      <header>
        <h3>{title}</h3>
        <button type="button" onClick={() => onEdit(step)} aria-label={`Edit ${title.toLowerCase()}`}>
          <Icon name="edit" size={14} />
          Edit
        </button>
      </header>
      <div>{children}</div>
    </section>
  )
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  if (!children) return null
  return (
    <p className="registration-review-row">
      <span>{label}</span>
      <b>{children}</b>
    </p>
  )
}

const dayLabel = (day: string): string => (day ? formatDay(`${day}T12:00:00Z`, 'UTC') : '')

interface ReviewStepProps {
  readonly fields: IntakeFields
  readonly onEdit: (step: number) => void
}

export function ReviewStep({ fields, onEdit }: ReviewStepProps) {
  const mode = fields.arrival_mode
  return (
    <>
      <ReviewCard title="Delegation" step={1} onEdit={onEdit}>
        <Row label="Name">{[fields.title, fields.full_name].filter(Boolean).join(' ')}</Row>
        <Row label="Position">{fields.organisation}</Row>
        <Row label="Contact">{fields.contact_name}</Row>
        <Row label="Email">{fields.contact_email}</Row>
        <Row label="Phone">{fields.contact_phone}</Row>
      </ReviewCard>
      <ReviewCard title="Arrival" step={2} onEdit={onEdit}>
        <Row label="Arriving">{mode ? ARRIVAL_MODE_LABELS[mode] : ''}</Row>
        {mode === 'flying' && <Row label="Flight">{[fields.airline, fields.flight_number].filter(Boolean).join(' · ')}</Row>}
        {mode === 'pickup' && <Row label="Pickup">{fields.pickup_address}</Row>}
        <Row label="Arrival">{[dayLabel(fields.arrival_date), fields.arrival_time].filter(Boolean).join(' · ')}</Row>
        <Row label="Departure">{dayLabel(fields.departure_date)}</Row>
      </ReviewCard>
      <ReviewCard title={`Party (${fields.party.length})`} step={3} onEdit={onEdit}>
        {fields.party.length ? (
          fields.party.map((member, index) => (
            <div className="review-party-row" key={index}>
              <b>
                {member.name || `Guest ${index + 1} (name to follow)`} · {PARTY_ROLE_LABELS[member.role]}
              </b>
              {(member.dietary || member.accessibility) && <small>{[member.dietary, member.accessibility].filter(Boolean).join(' · ')}</small>}
            </div>
          ))
        ) : (
          <p className="no-guests">No other guests.</p>
        )}
        <Row label="Dietary">{fields.dietary}</Row>
        <Row label="Accessibility">{fields.accessibility}</Row>
        <Row label="Notes">{fields.others}</Row>
      </ReviewCard>
    </>
  )
}
