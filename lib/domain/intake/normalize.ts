// Normalisation (FR-IN-07): titles split from names, names cased, phones to E.164, flight numbers
// to IATA form, dates and times to UTC in the event's zone. Pure and deterministic.
import { zonedDateTime } from '@/lib/domain/time'
import { airlineName } from './airlines'
import type { ArrivalMode, IntakeFields, PartyRole } from './schema'

const HONORIFICS = [
  'his excellency', 'her excellency', 'h.e.', 'rt. rev.', 'rt rev', 'most rev.', 'archbishop', 'bishop', 'rev.', 'rev',
  'pastor', 'prophet', 'apostle', 'canon', 'imam', 'sheikh', 'alhaji', 'alhaja', 'chief', 'sir', 'dame', 'dr.', 'dr',
  'prof.', 'prof', 'hon.', 'hon', 'senator', 'mr.', 'mr', 'mrs.', 'mrs', 'ms.', 'ms', 'miss',
] as const

/** "bishop augustine okafor" → { title: "Bishop", name: "Augustine Okafor" }. */
export function splitTitle(rawName: string, rawTitle = ''): { title: string; name: string } {
  const name = collapseSpaces(rawName)
  const title = collapseSpaces(rawTitle)
  if (title) return { title: tidyTitle(title), name: caseName(name) }
  const lower = name.toLowerCase()
  const match = HONORIFICS.find((honorific) => lower.startsWith(`${honorific} `))
  if (!match) return { title: '', name: caseName(name) }
  return { title: tidyTitle(name.slice(0, match.length)), name: caseName(name.slice(match.length).trim()) }
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function tidyTitle(title: string): string {
  if (title.toUpperCase() === 'H.E.') return 'H.E.'
  return title
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(' ')
}

/** Cases a name only when it was typed all in lower or upper case ("McDonald" stays as typed). */
export function caseName(name: string): string {
  const trimmed = collapseSpaces(name)
  if (trimmed !== trimmed.toLowerCase() && trimmed !== trimmed.toUpperCase()) return trimmed
  return trimmed
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, before: string, letter: string) => `${before}${letter.toUpperCase()}`)
}

const DEFAULT_COUNTRY_CODE = '234'

/** "0803 555 0142" → "+2348035550142"; null when it cannot be a valid E.164 number. */
export function normalizePhone(raw: string, countryCode = DEFAULT_COUNTRY_CODE): string | null {
  const compact = raw.replace(/[\s().-]/g, '')
  if (compact === '') return null
  let digits: string
  if (compact.startsWith('+')) digits = compact.slice(1)
  else if (compact.startsWith('00')) digits = compact.slice(2)
  else if (compact.startsWith('0')) digits = `${countryCode}${compact.slice(1)}`
  else digits = compact
  return /^[1-9][0-9]{6,14}$/.test(digits) ? `+${digits}` : null
}

/** "ek 783" / "EK-0783" → "EK783"; null when it does not look like a flight number. */
export function normalizeFlightNumber(raw: string): string | null {
  const compact = raw.toUpperCase().replace(/[\s-]/g, '')
  const match = /^([A-Z0-9]{2})0*([0-9]{1,4})([A-Z]?)$/.exec(compact)
  if (!match || !/[A-Z]/.test(match[1] ?? '')) return null
  return `${match[1]}${match[2]}${match[3]}`
}

/** "Vegetarian, no pork and halal" → ["Vegetarian", "No pork", "Halal"]. */
export function splitList(raw: string): string[] {
  return raw
    .split(/[,;\n]|\band\b/i)
    .map((item) => collapseSpaces(item))
    .filter((item) => item !== '' && !/^(none|n\/a|na|nil|no)$/i.test(item))
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
}

export interface NormalizedMember {
  readonly title: string
  readonly name: string | null
  readonly role: PartyRole
  readonly dietary: string[]
  readonly accessibility: string
}

export interface NormalizedIntake {
  readonly title: string
  readonly full_name: string
  readonly organisation: string
  readonly contact_name: string
  readonly contact_email: string | null
  readonly contact_phone: string | null
  readonly arrival_mode: ArrivalMode | null
  readonly flight_number: string | null
  readonly airline_iata: string | null
  readonly airline: string
  readonly arrival_date: string | null
  /** ISO instant: the flight's scheduled arrival, the own-transport arrival or the pickup time. */
  readonly arrival_at: string | null
  readonly pickup_address: string
  readonly departure_date: string | null
  readonly dietary: string[]
  readonly accessibility: string
  readonly others: string
  readonly party: NormalizedMember[]
}

export function normalizeIntake(fields: IntakeFields, timeZone: string): NormalizedIntake {
  const { title, name } = splitTitle(fields.full_name, fields.title)
  const flightNumber = fields.flight_number ? normalizeFlightNumber(fields.flight_number) : null
  const airlineIata = flightNumber ? flightNumber.slice(0, 2) : null
  const arrivalDate = fields.arrival_date || null
  return {
    title,
    full_name: name,
    organisation: collapseSpaces(fields.organisation),
    contact_name: caseName(fields.contact_name),
    contact_email: fields.contact_email ? fields.contact_email.trim().toLowerCase() : null,
    contact_phone: fields.contact_phone ? normalizePhone(fields.contact_phone) : null,
    arrival_mode: fields.arrival_mode ?? null,
    flight_number: flightNumber,
    airline_iata: airlineIata,
    airline: collapseSpaces(fields.airline) || (airlineIata ? (airlineName(airlineIata) ?? '') : ''),
    arrival_date: arrivalDate,
    arrival_at: arrivalDate && fields.arrival_time ? zonedDateTime(arrivalDate, fields.arrival_time, timeZone) : null,
    pickup_address: collapseSpaces(fields.pickup_address),
    departure_date: fields.departure_date || null,
    dietary: splitList(fields.dietary),
    accessibility: collapseSpaces(fields.accessibility),
    others: fields.others.trim(),
    party: fields.party.map((member) => {
      const split = splitTitle(member.name)
      return {
        title: split.title,
        name: split.name || null,
        role: member.role,
        dietary: splitList(member.dietary),
        accessibility: collapseSpaces(member.accessibility),
      }
    }),
  }
}

/** Display name for a delegation: "Bishop Augustine Okafor". */
export function displayName(intake: Pick<NormalizedIntake, 'title' | 'full_name'>): string {
  return [intake.title, intake.full_name].filter((part) => part !== '').join(' ')
}
