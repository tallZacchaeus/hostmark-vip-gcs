// The intake form (FR-IN-01…03), one schema shared by the public registration form, the API,
// pasted-message drafts and AI structured output. The guest never sets a VIP category (FR-IN-11).
import { z } from 'zod'

export const ARRIVAL_MODES = ['flying', 'own_transport', 'pickup'] as const
export type ArrivalMode = (typeof ARRIVAL_MODES)[number]

export const PARTY_ROLES = ['assistant', 'security', 'performer', 'representative', 'family', 'other'] as const
export type PartyRole = (typeof PARTY_ROLES)[number]

export const MAX_PARTY_SIZE = 10
export const MAX_OTHERS_LENGTH = 2000

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
/** No characters that would change a mailto: link (?, &, #, /, =, quotes, angle brackets). */
const EMAIL = /^[^@\s?&#/=<>"']+@[^@\s?&#/=<>"']+\.[^@\s?&#/=<>"']+$/
export const FLIGHT_NUMBER = /^[A-Z0-9]{2}[0-9]{1,4}[A-Z]?$/

const trimmed = (max: number) => z.string().trim().max(max, `At most ${max} characters`).default('')

export const partyMemberSchema = z.object({
  name: trimmed(200),
  role: z.enum(PARTY_ROLES, { message: 'Choose a role' }),
  dietary: trimmed(300),
  accessibility: trimmed(300),
})

export type PartyMember = z.infer<typeof partyMemberSchema>

export const intakeFieldsSchema = z.object({
  title: trimmed(60),
  full_name: z.string().trim().max(200).default(''),
  organisation: trimmed(200),
  contact_name: trimmed(200),
  contact_email: trimmed(254),
  contact_phone: trimmed(40),
  arrival_mode: z.enum(ARRIVAL_MODES).optional(),
  airline: trimmed(100),
  flight_number: trimmed(12),
  arrival_date: z.union([z.iso.date(), z.literal('')]).default(''),
  arrival_time: z.union([z.string().regex(TIME, 'Use HH:MM'), z.literal('')]).default(''),
  pickup_address: trimmed(500),
  departure_date: z.union([z.iso.date(), z.literal('')]).default(''),
  dietary: trimmed(500),
  accessibility: trimmed(500),
  others: trimmed(MAX_OTHERS_LENGTH),
  party: z.array(partyMemberSchema).max(MAX_PARTY_SIZE, `At most ${MAX_PARTY_SIZE} people travelling with the guest`).default([]),
})

export type IntakeFields = z.infer<typeof intakeFieldsSchema>

interface FieldProblem {
  readonly path: string
  readonly message: string
}

/** Required-by-mode rules (FR-IN-01). Returns every problem, so the form can mark each field. */
export function requiredFieldProblems(fields: IntakeFields): FieldProblem[] {
  const problems: FieldProblem[] = []
  const need = (ok: boolean, path: string, message: string) => {
    if (!ok) problems.push({ path, message })
  }
  need(fields.full_name !== '', 'full_name', 'Enter the full name')
  need(fields.contact_name !== '', 'contact_name', "Enter the contact person's name")
  need(fields.contact_email !== '' || fields.contact_phone !== '', 'contact_email', 'Give an email address or a phone number')
  need(fields.contact_email === '' || EMAIL.test(fields.contact_email), 'contact_email', 'Enter a valid email, for example name@example.com')
  need(fields.arrival_mode !== undefined, 'arrival_mode', 'Choose how you are arriving')
  need(fields.arrival_date !== '', 'arrival_date', 'Enter the arrival date')
  need(fields.departure_date !== '', 'departure_date', 'Enter the departure date')
  if (fields.arrival_mode === 'flying') {
    need(fields.flight_number !== '', 'flight_number', 'Enter the flight number, for example EK783')
    need(fields.airline !== '', 'airline', 'Enter the airline')
  }
  if (fields.arrival_mode === 'own_transport') {
    need(fields.arrival_time !== '', 'arrival_time', 'Enter the arrival time')
  }
  if (fields.arrival_mode === 'pickup') {
    need(fields.pickup_address !== '', 'pickup_address', 'Enter the pickup location')
    need(fields.arrival_time !== '', 'arrival_time', 'Enter the pickup time')
  }
  if (fields.arrival_date && fields.departure_date) {
    need(fields.departure_date >= fields.arrival_date, 'departure_date', 'The departure date must be on or after the arrival date')
  }
  return problems
}

/** A complete form (public registration, or a coordinator's approved review). */
export const intakeFormSchema = intakeFieldsSchema.superRefine((fields, context) => {
  for (const problem of requiredFieldProblems(fields)) {
    context.addIssue({ code: 'custom', path: [problem.path], message: problem.message })
  }
})

/** What the public form sends: the form plus consent and the bot-check token. */
export const publicRegistrationSchema = z.object({
  form: intakeFormSchema,
  consent: z.literal(true, { message: 'Tick the box to confirm your details are correct and agree to how they are used' }),
  turnstile_token: z.string().max(4096).optional(),
})

export type PublicRegistration = z.infer<typeof publicRegistrationSchema>
