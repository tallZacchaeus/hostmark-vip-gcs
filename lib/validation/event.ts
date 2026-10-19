// Event settings (FR-PL-03). Limits mirror the CHECK constraints on public.events.
import { z } from 'zod'
import { AT_LEAST_ONE_FIELD, hasAtLeastOneField, intInRange, requiredText } from './common'

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}

const isoDate = z.iso.date('Use the format YYYY-MM-DD')
const airportCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use 3-letter IATA airport codes, e.g. LOS')
const MAX_AIRPORTS = 10

const optionalSettings = {
  arrival_airports: z.array(airportCode).max(MAX_AIRPORTS).optional(),
  intake_open: z.boolean().optional(),
  intake_window_days: intInRange(0, 30).optional(),
  airport_exit_buffer_min: intInRange(0, 240).optional(),
  airport_travel_min: intInRange(0, 600).optional(),
  local_travel_min: intInRange(0, 600).optional(),
  delay_threshold_min: intInRange(0, 240).optional(),
  cleaning_delay_buffer_min: intInRange(0, 240).optional(),
  program_lead_time_min: intInRange(0, 240).optional(),
  /** Only a Super Admin may change this (enforced by the database). */
  flight_mode: z.enum(['live', 'simulated']).optional(),
  auto_process_enabled: z.boolean().optional(),
}

const coreFields = {
  name: requiredText(200),
  venue_name: requiredText(200),
  timezone: z.string().trim().refine(isValidTimeZone, 'Unknown time zone; use an IANA name such as Africa/Lagos'),
  starts_on: isoDate,
  ends_on: isoDate,
}

function datesInOrder(value: { starts_on?: string; ends_on?: string }): boolean {
  return !value.starts_on || !value.ends_on || value.ends_on >= value.starts_on
}
const DATES_IN_ORDER = { message: 'The event must end on or after its start date', path: ['ends_on'] }

export const eventCreateSchema = z.strictObject({ ...coreFields, ...optionalSettings }).refine(datesInOrder, DATES_IN_ORDER)

export const eventUpdateSchema = z
  .strictObject({
    name: coreFields.name.optional(),
    venue_name: coreFields.venue_name.optional(),
    timezone: coreFields.timezone.optional(),
    starts_on: coreFields.starts_on.optional(),
    ends_on: coreFields.ends_on.optional(),
    ...optionalSettings,
  })
  .refine(hasAtLeastOneField, AT_LEAST_ONE_FIELD)
  .refine(datesInOrder, DATES_IN_ORDER)

export type EventCreate = z.infer<typeof eventCreateSchema>
export type EventUpdate = z.infer<typeof eventUpdateSchema>
