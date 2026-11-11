'use client'
// Public registration (FR-IN-01…03, 03-App-Flow.md F1): four steps, required fields by arrival
// mode, consent, an optional bot check, then the confirmation page with a reference code.
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { EMPTY_FIELDS, type IntakeFields, type PartyMember } from '@/features/intake/model'
import { ApiClientError, apiSend } from '@/lib/client/api'
import { requiredFieldProblems } from '@/lib/domain/intake/schema'
import { isInTravelWindow, type TravelWindow, travelWindowMessage } from '@/lib/domain/intake/travel-window'
import { saveReceipt, type RegistrationReceipt } from './receipt'
import { ArrivalStep, DelegationStep, type Errors, PartyStep, ReviewStep } from './RegistrationSteps'
import { TurnstileWidget } from './TurnstileWidget'

const STEP_NAMES = ['Delegation', 'Arrival', 'Party', 'Review'] as const
const STEP_FIELDS: readonly (readonly string[])[] = [
  ['title', 'full_name', 'organisation', 'contact_name', 'contact_email', 'contact_phone'],
  ['arrival_mode', 'airline', 'flight_number', 'arrival_date', 'arrival_time', 'pickup_address', 'departure_date'],
  ['dietary', 'accessibility', 'party', 'others'],
]
const LAST_STEP = STEP_NAMES.length

/** The step (1-based) that shows a field such as "contact_email" or "party.2.name". */
function stepOf(path: string): number {
  const field = path.split('.')[0] ?? path
  const index = STEP_FIELDS.findIndex((fields) => fields.includes(field))
  return index === -1 ? LAST_STEP : index + 1
}

/** Arrival or departure dates outside the event's travel dates. */
function travelDateErrors(fields: IntakeFields, window: TravelWindow | null): Errors {
  if (!window) return {}
  const outside = (['arrival_date', 'departure_date'] as const).filter((field) => fields[field] !== '' && !isInTravelWindow(fields[field], window))
  return Object.fromEntries(outside.map((field) => [field, travelWindowMessage(window)]))
}

function stepErrors(fields: IntakeFields, step: number, window: TravelWindow | null): Errors {
  const required = Object.fromEntries(
    requiredFieldProblems(fields)
      .filter((problem) => stepOf(problem.path) === step)
      .map((problem) => [problem.path, problem.message]),
  )
  return step === stepOf('arrival_date') ? { ...travelDateErrors(fields, window), ...required } : required
}

/** Server-side field problems ("form.full_name") as form errors. */
function serverErrors(details: unknown): Errors {
  if (!Array.isArray(details)) return {}
  return Object.fromEntries(
    (details as { path?: string; message?: string }[])
      .filter((problem) => problem.path?.startsWith('form.'))
      .map((problem) => [String(problem.path).slice('form.'.length), problem.message ?? 'Check this field']),
  )
}

// apiSend reports every failure as an ApiClientError: a dropped connection is "offline", and a
// reply that is not the API's (e.g. a proxy's error page) is "unexpected_response".
function failureMessage(error: unknown): string {
  if (!(error instanceof ApiClientError) || error.code === 'unexpected_response') return "We couldn't send your registration. Your answers are saved. Try again."
  if (error.code === 'rate_limited') return 'Too many registrations were sent from this connection. Wait a few minutes and try again.'
  if (error.code === 'offline') return "We couldn't reach the server. Check your connection; your answers are saved."
  return error.message
}

interface StepBarProps {
  readonly step: number
  readonly onGo: (step: number) => void
}

function StepBar({ step, onGo }: StepBarProps) {
  return (
    <div className="registration-progress">
      <div>
        <b>
          Step {step} of {LAST_STEP}
        </b>
        <span>{STEP_NAMES[step - 1]}</span>
      </div>
      <ol className="registration-bars">
        {STEP_NAMES.map((name, index) => {
          const number = index + 1
          const state = number < step ? 'is-complete' : number === step ? 'is-current' : ''
          return (
            <li key={name}>
              <button type="button" className={state} disabled={number >= step} onClick={() => onGo(number)} aria-current={number === step ? 'step' : undefined}>
                <i />
                <span>{name}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export interface RegistrationEvent {
  readonly event_name: string
  readonly venue_name: string
  /** The dates guests may arrive and leave (YYYY-MM-DD, inclusive); absent means unrestricted. */
  readonly travel_from?: string
  readonly travel_to?: string
}

interface RegistrationScreenProps {
  readonly token: string
  readonly event: RegistrationEvent
  readonly siteKey: string | null
}

export function RegistrationScreen({ token, event, siteKey }: RegistrationScreenProps) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [fields, setFields] = useState<IntakeFields>(EMPTY_FIELDS)
  const [errors, setErrors] = useState<Errors>({})
  const [consent, setConsent] = useState(false)
  const [botToken, setBotToken] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const onBotToken = useCallback((value: string | null) => setBotToken(value), [])
  const travelDates = event.travel_from && event.travel_to ? { from: event.travel_from, to: event.travel_to } : null

  const setField = <K extends keyof IntakeFields>(name: K, value: IntakeFields[K]) => {
    setFields((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }
  const setParty = (party: PartyMember[]) => setField('party', party)
  const goTo = (target: number) => {
    setStep(target)
    window.scrollTo({ top: 0 })
  }

  const submit = async () => {
    setSubmitting(true)
    setFailure(null)
    try {
      const receipt = await apiSend<RegistrationReceipt>(`/api/intake/${encodeURIComponent(token)}`, 'POST', {
        form: fields,
        consent: true,
        ...(botToken ? { turnstile_token: botToken } : {}),
      })
      saveReceipt(token, receipt)
      router.push(`/register/${encodeURIComponent(token)}/done`)
    } catch (error: unknown) {
      const fieldErrors = error instanceof ApiClientError && error.code === 'validation_failed' ? serverErrors(error.details) : {}
      const firstField = Object.keys(fieldErrors)[0]
      if (firstField) {
        setErrors(fieldErrors)
        goTo(stepOf(firstField))
      } else {
        setFailure(failureMessage(error))
      }
      setSubmitting(false)
    }
  }

  const next = () => {
    const found: Errors = step === LAST_STEP ? (consent ? {} : { consent: 'Tick the box to confirm your details are correct' }) : stepErrors(fields, step, travelDates)
    if (step === LAST_STEP && siteKey && !botToken) found.bot = 'Complete the check above to show you are a person'
    setErrors(found)
    if (Object.keys(found).length > 0) return
    if (step < LAST_STEP) goTo(step + 1)
    else void submit()
  }

  return (
    <main className="registration-page">
      <div className="registration-column">
        <header className="registration-banner">
          <div className="public-brand">
            <img src="/hostmark-logo-C.svg" alt="" width={34} height={34} />
            <b>
              <span>Host</span>mark
            </b>
          </div>
          <p>YOU ARE REGISTERING FOR</p>
          <h2>{event.event_name}</h2>
          <div className="banner-skyline" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </header>
        <section className="registration-card" aria-labelledby="registration-title">
          <form
            className="registration-card-body"
            noValidate
            onSubmit={(formEvent) => {
              formEvent.preventDefault()
              next()
            }}
          >
            <h1 id="registration-title">Register your delegation</h1>
            <p>Takes about 3 minutes. We will confirm by email.</p>
            <StepBar step={step} onGo={goTo} />
            {step === 1 && <DelegationStep fields={fields} errors={errors} setField={setField} />}
            {step === 2 && <ArrivalStep fields={fields} errors={errors} setField={setField} travelDates={travelDates} />}
            {step === 3 && <PartyStep fields={fields} errors={errors} setField={setField} setParty={setParty} />}
            {step === LAST_STEP && (
              <div className="registration-review">
                {failure && (
                  <div className="registration-failure" role="alert">
                    <Icon name="alert" />
                    <span>{failure}</span>
                  </div>
                )}
                <ReviewStep fields={fields} onEdit={goTo} />
                <label className={`registration-confirm ${errors.consent ? 'has-error' : ''}`}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={consent}
                    className={consent ? 'is-checked' : ''}
                    onClick={() => {
                      setConsent((value) => !value)
                      setErrors((current) => ({ ...current, consent: undefined }))
                    }}
                  >
                    {consent && <Icon name="check" size={16} />}
                  </button>
                  <span>I confirm these details are correct and agree that the organisers use them to arrange travel and accommodation for this event.</span>
                  {errors.consent && <small role="alert">{errors.consent}</small>}
                </label>
                {siteKey && <TurnstileWidget siteKey={siteKey} onToken={onBotToken} />}
                {errors.bot && (
                  <small className="registration-error" role="alert">
                    <Icon name="alert" size={14} />
                    {errors.bot}
                  </small>
                )}
              </div>
            )}
            <footer className="registration-footer">
              {step > 1 && (
                <button type="button" className="registration-back" onClick={() => goTo(step - 1)}>
                  <Icon name="arrow" size={18} />
                  Back
                </button>
              )}
              <button type="submit" className="registration-next" disabled={submitting} aria-busy={submitting || undefined}>
                {submitting && <i />}
                <span>{submitting ? 'Submitting…' : step === LAST_STEP ? 'Submit registration' : 'Next'}</span>
                {!submitting && <Icon name="arrow" size={18} />}
              </button>
            </footer>
          </form>
        </section>
      </div>
    </main>
  )
}
