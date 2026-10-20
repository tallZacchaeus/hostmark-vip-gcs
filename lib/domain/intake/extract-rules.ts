// Offline reader for free text (FR-IN-04/05) used when no AI provider is configured, and as the
// baseline the AI is evaluated against. Keyword rules, deterministic, no network.
import { type ExtractedItem, MAX_EXTRACTED_ITEMS, type RequirementCategory } from './extraction'
import { normalizeFlightNumber } from './normalize'
import type { IntakeFields, PartyMember, PartyRole } from './schema'

const CATEGORY_RULES: ReadonlyArray<readonly [RequirementCategory, RegExp]> = [
  ['medical', /\b(allerg\w*|insulin|diabet\w*|medication|medicine|asthma\w*|heart|blood pressure|hypertension|epipen|doctor|nurse|medical|pregnan\w*)\b/i],
  ['accessibility', /\b(wheelchair|mobility|crutch\w*|walker|walking stick|cane|lifts?|elevator|accessible|hearing|deaf|blind|visually impaired|disab\w*|stairs)\b/i],
  ['security', /\b(security|bodyguards?|armed|escorts?|police|protection|adc|aide-de-camp)\b/i],
  ['dietary', /\b(vegetarian|vegan|halal|kosher|gluten|lactose|dairy|low[- ]sugar|no pork|no beef|pescatarian|low[- ]salt|meals?|diet|food)\b/i],
  ['room_preference', /\b(ground floor|low floor|high floor|quiet|suite|adjoining|connecting|twin|king bed|non[- ]smoking|rooms?)\b/i],
  ['schedule', /\b(late|early|leave|leaving|depart\w*|join later|delay\w*|tomorrow|tonight|morning|evening|afternoon)\b/i],
  ['transport', /\b(pick ?up|cars?|bus|drivers?|airport|transfer|convoy|motorcade|vehicles?)\b/i],
]

const UNCERTAIN = /\b(may|maybe|might|possibly|perhaps|probably|not sure|unsure|tbc|tbd|to be confirmed|not confirmed)\b/i
/** Categories a person must always see, whoever read the note. */
export const ALWAYS_ATTENTION: ReadonlySet<RequirementCategory> = new Set(['medical', 'security', 'schedule', 'other'])
// Upper-case designators may be spaced ("EK 783", "P4-7121"); lower case only when joined
// ("ek783"), so ordinary words before a number ("at 09:00", "on 28 October") are not flights.
const FLIGHT_IN_TEXT = /\b(?:([A-Z]{2}|[A-Z][0-9]|[0-9][A-Z])[ -]?([0-9]{2,4})|([a-z]{2}|[a-z][0-9]|[0-9][a-z])([0-9]{2,4}))\b/g
const PEOPLE_COUNT = /\bwith\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:other\s+)?(?:people|persons|guests|members|others)\b/i
const NUMBER_WORDS: Readonly<Record<string, number>> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 2)
}

function categoryOf(sentence: string): RequirementCategory {
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(sentence))?.[0] ?? 'other'
}

function toNumber(word: string): number {
  return NUMBER_WORDS[word.toLowerCase()] ?? Number.parseInt(word, 10)
}

export function flightNumbersIn(text: string): string[] {
  return [...text.matchAll(FLIGHT_IN_TEXT)]
    .map((match) => normalizeFlightNumber(`${match[1] ?? match[3]}${match[2] ?? match[4]}`))
    .filter((value): value is string => value !== null)
}

export interface ExtractionContext {
  readonly flight_number: string | null
  readonly party_size: number
}

/** Reads the "others" field into typed items, flagging uncertainty and contradictions. */
export function extractWithRules(text: string, context: ExtractionContext): ExtractedItem[] {
  return sentences(text).slice(0, MAX_EXTRACTED_ITEMS).map((sentence) => {
    const category = categoryOf(sentence)
    const otherFlight = flightNumbersIn(sentence).find((flight) => context.flight_number !== null && flight !== context.flight_number)
    const count = PEOPLE_COUNT.exec(sentence)
    const countConflict = count && toNumber(count[1] ?? '') !== context.party_size
    const conflictsWith = otherFlight ? 'flight_number' : countConflict ? 'party_size' : null
    return {
      category,
      detail: sentence,
      needs_attention: ALWAYS_ATTENTION.has(category) || UNCERTAIN.test(sentence) || conflictsWith !== null,
      conflicts_with: conflictsWith,
    }
  })
}

const ROLE_WORDS: ReadonlyArray<readonly [RegExp, PartyRole]> = [
  [/^(wife|husband|son|daughter|mother|father|brother|sister|spouse)s?$/i, 'family'],
  [/^(assistants?|aides?|secretar(y|ies)|pa|personal assistants?|chaplains?)$/i, 'assistant'],
  [/^(security(?: men| man| officers?| detail)?|bodyguards?|adcs?|guards?)$/i, 'security'],
  [/^(singers?|backup singers?|band members?|musicians?|choir|dancers?)$/i, 'performer'],
  [/^(representatives?|delegates?)$/i, 'representative'],
]
const MEMBER_MENTION =
  /\b(?:(one|two|three|four|five|\d+|a|an|his|her|their)\s+)?(wife|husband|son|daughter|mother|father|brother|sister|spouse|assistants?|aides?|secretary|secretaries|pa|chaplains?|security(?: men| man| officers?| detail)?|bodyguards?|adcs?|singers?|backup singers?|band members?|musicians?|dancers?|representatives?|delegates?)\b/gi

function roleOf(word: string): PartyRole {
  return ROLE_WORDS.find(([pattern]) => pattern.test(word))?.[1] ?? 'other'
}

/** People mentioned around the guest: "his wife, his chaplain and two security men". */
export function partyFromText(text: string): PartyMember[] {
  const members: PartyMember[] = []
  for (const match of text.matchAll(MEMBER_MENTION)) {
    const quantity = match[1] && /^\d+$|^(one|two|three|four|five)$/i.test(match[1]) ? toNumber(match[1]) : 1
    const role = roleOf(match[2] ?? '')
    for (let index = 0; index < Math.min(quantity, 10); index += 1) {
      members.push({ name: '', role, dietary: '', accessibility: '' })
    }
  }
  if (members.length === 0) {
    const count = PEOPLE_COUNT.exec(text)
    const size = count ? toNumber(count[1] ?? '') : 0
    return Array.from({ length: Math.min(size, 10) }, () => ({ name: '', role: 'other' as const, dietary: '', accessibility: '' }))
  }
  return members.slice(0, 10)
}

const NAME_WITH_TITLE =
  /\b(H\.E\.|His Excellency|Her Excellency|Archbishop|Bishop|Rev\.?|Pastor|Dr\.?|Prof\.?|Hon\.?|Chief|Alhaji|Imam|Senator|Mr\.?|Mrs\.?|Ms\.?)\s+((?:[A-Z][a-zA-Z'-]+)(?:\s+[A-Z][a-zA-Z'-]+){0,2})/
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const DAY_MONTH = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i
const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/
const TIME_12H = /\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/i
const TIME_24H = /\b([01]?\d|2[0-3]):([0-5]\d)\b/

function dateFrom(text: string, year: number): string {
  const iso = ISO_DATE.exec(text)
  if (iso?.[1]) return iso[1]
  const dayMonth = DAY_MONTH.exec(text)
  if (!dayMonth) return ''
  const month = MONTHS.indexOf((dayMonth[2] ?? '').slice(0, 3).toLowerCase()) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(Number(dayMonth[1])).padStart(2, '0')}`
}

function timeFrom(text: string): string {
  const twelve = TIME_12H.exec(text)
  if (twelve) {
    const hours = (Number(twelve[1]) % 12) + (twelve[3]?.toLowerCase() === 'pm' ? 12 : 0)
    return `${String(hours).padStart(2, '0')}:${twelve[2] ?? '00'}`
  }
  const twentyFour = TIME_24H.exec(text)
  return twentyFour ? `${String(Number(twentyFour[1])).padStart(2, '0')}:${twentyFour[2]}` : ''
}

export interface MessageDraft {
  readonly fields: Partial<IntakeFields>
  readonly items: ExtractedItem[]
}

/** A first draft of the form from a forwarded message (FR-IN-05); the coordinator completes it. */
export function draftFromMessageWithRules(text: string, year: number): MessageDraft {
  const name = NAME_WITH_TITLE.exec(text)
  const flight = flightNumbersIn(text)[0] ?? ''
  const party = partyFromText(text)
  const pickup = /\bpick(?:\s|-)?up\b|\bcollect (?:him|her|them)\b/i.test(text)
  const ownTransport = /\b(own car|own transport|driving|drive (?:himself|herself|themselves))\b/i.test(text)
  const mode = flight ? 'flying' : pickup ? 'pickup' : ownTransport ? 'own_transport' : undefined
  const dietary = (text.match(/\b(vegetarian|vegan|halal|kosher|gluten[- ]free|low[- ]sugar|no pork|lactose[- ]free)\b/gi) ?? []).join(', ')
  return {
    fields: {
      title: name?.[1] ?? '',
      full_name: name?.[2] ?? '',
      arrival_mode: mode,
      flight_number: flight,
      arrival_date: dateFrom(text, year),
      arrival_time: timeFrom(text),
      dietary,
      party,
      others: text.trim(),
    },
    items: extractWithRules(text, { flight_number: flight || null, party_size: party.length }),
  }
}
