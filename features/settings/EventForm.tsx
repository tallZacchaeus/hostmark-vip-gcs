'use client'
// Event settings (FR-PL-03): dates, time zone, airports, the coordination desk phone and the
// fixed buffers the cascade uses.
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/FormDialog'
import { Icon } from '@/components/ui/Icon'
import { apiSend } from '@/lib/client/api'
import { useAction } from '@/lib/client/use-action'
import type { EventSettings } from './types'

type NumberKey =
  | 'intake_window_days'
  | 'airport_exit_buffer_min'
  | 'airport_travel_min'
  | 'local_travel_min'
  | 'delay_threshold_min'
  | 'cleaning_delay_buffer_min'
  | 'program_lead_time_min'

const NUMBER_FIELDS: ReadonlyArray<{ key: NumberKey; label: string; hint: string; max: number; fallback: number }> = [
  { key: 'airport_exit_buffer_min', label: 'Airport exit (minutes)', hint: 'Landing to pickup time', max: 240, fallback: 30 },
  { key: 'airport_travel_min', label: 'Airport to venue (minutes)', hint: 'Fixed travel time, no live traffic', max: 600, fallback: 60 },
  { key: 'local_travel_min', label: 'Local pickup travel (minutes)', hint: 'For "pick me up" requests', max: 600, fallback: 45 },
  { key: 'delay_threshold_min', label: 'Delay threshold (minutes)', hint: 'A flight later than this is "delayed"', max: 240, fallback: 15 },
  { key: 'cleaning_delay_buffer_min', label: 'Cleaning buffer (minutes)', hint: 'Added to room ready estimates', max: 240, fallback: 15 },
  { key: 'program_lead_time_min', label: 'Programme lead time (minutes)', hint: 'Guests must arrive this early', max: 240, fallback: 30 },
  { key: 'intake_window_days', label: 'Travel window (days)', hint: 'Guests may arrive this many days before the event and leave this many days after it', max: 30, fallback: 3 },
]

interface EventFormProps {
  /** The event to edit (the current one), or null to create a new draft event (P9 step 9.4). */
  readonly event: EventSettings | null
  readonly onSaved: (saved: EventSettings) => void
}

export function EventForm({ event, onSaved }: EventFormProps) {
  const [name, setName] = useState(event?.name ?? '')
  const [venue, setVenue] = useState(event?.venue_name ?? '')
  const [timezone, setTimezone] = useState(event?.timezone ?? 'Africa/Lagos')
  const [startsOn, setStartsOn] = useState(event?.starts_on ?? '')
  const [endsOn, setEndsOn] = useState(event?.ends_on ?? '')
  const [airports, setAirports] = useState((event?.arrival_airports ?? []).join(', '))
  const [numbers, setNumbers] = useState<Record<NumberKey, string>>(
    () => Object.fromEntries(NUMBER_FIELDS.map((field) => [field.key, String(event?.[field.key] ?? field.fallback)])) as Record<NumberKey, string>,
  )
  const [coordinatorPhone, setCoordinatorPhone] = useState(event?.coordinator_phone ?? '')
  const [autoProcess, setAutoProcess] = useState(event?.auto_process_enabled ?? true)
  const action = useAction()

  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault()
    void action.run(async () => {
      const body = {
        name: name.trim(),
        venue_name: venue.trim(),
        timezone: timezone.trim(),
        starts_on: startsOn,
        ends_on: endsOn,
        arrival_airports: airports
          .split(',')
          .map((code) => code.trim().toUpperCase())
          .filter((code) => code !== ''),
        coordinator_phone: coordinatorPhone.trim() || null,
        auto_process_enabled: autoProcess,
        ...Object.fromEntries(NUMBER_FIELDS.map((field) => [field.key, Number.parseInt(numbers[field.key], 10)])),
      }
      const saved = event
        ? await apiSend<EventSettings>('/api/admin/event', 'PATCH', body)
        : await apiSend<EventSettings>('/api/events', 'POST', body)
      onSaved(saved)
    })
  }

  return (
    <form className="data-card event-form" onSubmit={submit} noValidate aria-labelledby="event-form-title">
      <header>
        <div>
          <h2 id="event-form-title">{event ? 'Event' : 'New event'}</h2>
          <p>Times are shown in the event time zone everywhere in the app.</p>
        </div>
      </header>
      <div className="form-grid event-form-body">
        <Field label="Event name" required className="is-wide">
          <input value={name} onChange={(changeEvent) => setName(changeEvent.target.value)} />
        </Field>
        <Field label="Venue" required className="is-wide">
          <input value={venue} onChange={(changeEvent) => setVenue(changeEvent.target.value)} />
        </Field>
        <Field label="First day" required>
          <input type="date" value={startsOn} onChange={(changeEvent) => setStartsOn(changeEvent.target.value)} />
        </Field>
        <Field label="Last day" required>
          <input type="date" value={endsOn} onChange={(changeEvent) => setEndsOn(changeEvent.target.value)} />
        </Field>
        <Field label="Time zone" hint="IANA name, e.g. Africa/Lagos">
          <input value={timezone} onChange={(changeEvent) => setTimezone(changeEvent.target.value)} />
        </Field>
        <Field label="Arrival airports" hint="IATA codes, comma-separated, e.g. LOS, ABV">
          <input value={airports} onChange={(changeEvent) => setAirports(changeEvent.target.value)} />
        </Field>
        <Field label="Coordination desk phone" hint="Drivers can call this number from their app. Leave blank to hide the button.">
          <input type="tel" autoComplete="tel" value={coordinatorPhone} onChange={(changeEvent) => setCoordinatorPhone(changeEvent.target.value)} />
        </Field>
        {NUMBER_FIELDS.map((field) => (
          <Field key={field.key} label={field.label} hint={field.hint}>
            <input
              type="number"
              min={0}
              max={field.max}
              value={numbers[field.key]}
              onChange={(changeEvent) => setNumbers((current) => ({ ...current, [field.key]: changeEvent.target.value }))}
            />
          </Field>
        ))}
        <label className="checkbox-field is-wide">
          <input type="checkbox" checked={autoProcess} onChange={(changeEvent) => setAutoProcess(changeEvent.target.checked)} />
          Process clean registrations automatically (unclear ones always go to Intake for review)
        </label>
      </div>
      <footer className="event-form-footer">
        {action.error && (
          <p className="form-error" role="alert">
            <Icon name="alert" size={16} />
            {action.error}
          </p>
        )}
        <Button kind="primary" type="submit" busy={action.busy} disabled={!name.trim() || !venue.trim() || !startsOn || !endsOn}>
          {event ? 'Save event' : 'Create event'}
        </Button>
      </footer>
    </form>
  )
}
