// The offline Co-Pilot's understanding (FR-CP-02/04): a coordinator's question → one typed tool
// call with arguments resolved against live names (guests, drivers, flights, rooms). Pure and
// deterministic, so the evaluation can measure it. It never invents an entity: an unknown or
// ambiguous name becomes a clarifying question, and anything else gets the help answer. Text in the
// question is only matched against known patterns, so instructions inside it are never followed.

export interface Vocabulary {
  readonly guests: readonly { readonly id: string; readonly name: string; readonly title: string | null }[]
  readonly drivers: readonly { readonly id: string; readonly name: string }[]
  readonly flights: readonly string[]
  readonly rooms: readonly string[]
}

export type ArrivalWindow = 'today' | 'tomorrow' | 'next_hours'
export type ArrivalFilter = 'all' | 'missing_driver' | 'room_not_ready' | 'delayed'
export type ClarifyReason = 'unknown_guest' | 'ambiguous_guest' | 'unknown_room' | 'unknown_driver' | 'empty_note'

export type Intent =
  | { readonly tool: 'find_arrivals'; readonly args: { readonly window: ArrivalWindow; readonly hours: number | null; readonly filter: ArrivalFilter } }
  | { readonly tool: 'get_guest'; readonly args: { readonly guest_id: string } }
  | { readonly tool: 'get_flight_status'; readonly args: { readonly flight_number: string } }
  | { readonly tool: 'who_is_affected'; readonly args: { readonly flight_number: string } }
  | { readonly tool: 'list_pickups'; readonly args: { readonly filter: 'all' | 'unassigned' } }
  | { readonly tool: 'list_rooms'; readonly args: { readonly filter: 'free' | 'all' } }
  | { readonly tool: 'get_cleaning_queue'; readonly args: Record<string, never> }
  | { readonly tool: 'get_program'; readonly args: { readonly day: 'today' | 'tomorrow'; readonly filter: 'all' | 'at_risk' } }
  | { readonly tool: 'get_pending_decisions'; readonly args: Record<string, never> }
  | { readonly tool: 'propose_room_move'; readonly args: { readonly guest_id: string; readonly room_number: string } }
  | { readonly tool: 'propose_driver_assignment'; readonly args: { readonly guest_id: string; readonly driver_id: string } }
  | { readonly tool: 'add_note'; readonly args: { readonly guest_id: string; readonly text: string } }
  | { readonly tool: 'clarify'; readonly args: { readonly reason: ClarifyReason; readonly options: string[] } }
  | { readonly tool: 'help'; readonly args: Record<string, never> }

export type ToolName = Intent['tool']

const HELP: Intent = { tool: 'help', args: {} }
const DEFAULT_HOURS = 1
const NOTE_SEPARATOR = /\s*(?::|\s[-–—]\s)\s*/
/** "Could you please", "kindly", "I'd like you to": openers that carry no intent, dropped from the front. */
const POLITE_OPENER = /^(?:(?:hi|hello|hey|ok(?:ay)?|please|pls|kindly|just|(?:can|could|would|will) (?:you|we)(?: be able to)?|(?:i|we)(?:'d| would)? (?:like|want|need)(?: you)? to|go ahead and|let's)\b[\s,.!]*)+/
const ARRIVING = /\b(arriv\w*|lands?|landing|coming|expected|incoming)\b|\bflights?\b.*\bdelay/
/** "no car", "without a driver", "needs a ride", "hasn't been assigned transport". */
const NO_TRANSPORT =
  /(?:\b(?:no|without|missing|needs?|lacks?|lacking)|(?:\bnot|n't)(?: yet)? (?:have|has|got|been (?:given|assigned|allocated)))(?: (?:a|an|any|their|his|her))? (?:drivers?|cars?|vehicles?|rides?|transport(?:ation)?|chauffeurs?)\b/
const CLEANING = /\b(clean\w*|dirty|housekeeping|sanitation)\b/
/** "not ready", "isn't made up yet", "still dirty", "being cleaned", "waiting for housekeeping". */
const ROOM_NOT_READY = /(?:\bnot|n't)(?: yet)? (?:ready|clean(?:ed)?|prepared|made up)\b|\b(?:unready|dirty)\b|\b(?:needs?|awaiting|waiting for|to be|being) (?:clean\w*|prepared|made up|housekeeping)\b/
/** "whose room", "their room": the question is about the arriving guests, not the rooms. */
const OWN_ROOM = /\b(whose|their|his|her) rooms?\b/
const FREE = /\b(free|available|ready|empty|vacant)\b/
const NOT_FREE = /(?:\bnot|n't)(?: yet)? (?:free|available|empty|vacant)\b/
const CLEANING_QUEUE: Intent = { tool: 'get_cleaning_queue', args: {} }

const normalize = (text: string): string => text.toLowerCase().replace(/[’‘`]/g, "'")
const words = (text: string): string[] => (normalize(text).match(/[a-z0-9]+(?:'[a-z]+)?/g) ?? []).map((word) => word.replace(/'s$/, ''))
const titleWords = (title: string | null): string[] => words(title ?? '')
const displayName = (guest: Vocabulary['guests'][number]): string => [guest.title, guest.name].filter(Boolean).join(' ')
const clarify = (reason: ClarifyReason, options: string[] = []): Intent => ({ tool: 'clarify', args: { reason, options } })

type GuestMatch = { readonly kind: 'one'; readonly id: string } | { readonly kind: 'many'; readonly options: string[] } | { readonly kind: 'none' }

/**
 * Full name first; otherwise the guests matching the most name words (a surname alone may be
 * shared), narrowed by title when that settles it.
 */
function matchGuest(text: string, vocabulary: Vocabulary): GuestMatch {
  const tokens = words(text)
  const joined = ` ${tokens.join(' ')} `
  const full = vocabulary.guests.filter((guest) => joined.includes(` ${words(guest.name).join(' ')} `))
  if (full.length === 1 && full[0]) return { kind: 'one', id: full[0].id }
  const scored = vocabulary.guests.map((guest) => ({ guest, score: words(guest.name).filter((part) => part.length > 2 && tokens.includes(part)).length }))
  const best = Math.max(0, ...scored.map((item) => item.score))
  const byPart = best === 0 ? [] : scored.filter((item) => item.score === best).map((item) => item.guest)
  const narrowed = byPart.length > 1 ? byPart.filter((guest) => titleWords(guest.title).some((word) => tokens.includes(word))) : byPart
  const candidates = narrowed.length > 0 ? narrowed : byPart
  if (candidates.length === 1 && candidates[0]) return { kind: 'one', id: candidates[0].id }
  if (candidates.length > 1) return { kind: 'many', options: candidates.map(displayName) }
  return { kind: 'none' }
}

interface DriverMatch {
  readonly id: string
  /** The words that named the driver, removed before looking for the guest. */
  readonly named: readonly string[]
}

/** Full name first, then a unique first name, then a unique surname (drivers can share guests' surnames). */
function matchDriver(text: string, vocabulary: Vocabulary): DriverMatch | null {
  const tokens = words(text)
  const joined = ` ${tokens.join(' ')} `
  const parts = (driver: Vocabulary['drivers'][number]) => words(driver.name)
  const levels: readonly ((driver: Vocabulary['drivers'][number]) => readonly string[] | null)[] = [
    (driver) => (joined.includes(` ${parts(driver).join(' ')} `) ? parts(driver) : null),
    (driver) => (tokens.includes(parts(driver)[0] ?? '') ? parts(driver).slice(0, 1) : null),
    (driver) => (tokens.includes(parts(driver).at(-1) ?? '') ? parts(driver).slice(-1) : null),
  ]
  for (const level of levels) {
    const found = vocabulary.drivers.flatMap((driver) => {
      const named = level(driver)
      return named && named.every((part) => part.length > 2) ? [{ id: driver.id, named }] : []
    })
    if (found.length === 1 && found[0]) return found[0]
    if (found.length > 1) return null
  }
  return null
}

/** The question without the first occurrence of each word that named the driver. */
function withoutWords(text: string, named: readonly string[]): string {
  const remaining = [...named]
  return words(text)
    .filter((word) => {
      const index = remaining.indexOf(word)
      if (index === -1) return true
      remaining.splice(index, 1)
      return false
    })
    .join(' ')
}

/** "ET512", "et 512": only flights the event knows. */
function matchFlight(text: string, vocabulary: Vocabulary): string | null {
  const known = new Set(vocabulary.flights.map((flight) => flight.toUpperCase()))
  for (const match of normalize(text).matchAll(/\b([a-z0-9]{2})\s?(\d{1,4})\b/g)) {
    const flight = `${match[1] ?? ''}${match[2] ?? ''}`.toUpperCase()
    if (known.has(flight)) return flight
  }
  return null
}

function matchRoom(text: string): string | null {
  return normalize(text).match(/(?:^|[^a-z0-9])(\d{2,4})(?![a-z0-9])/)?.[1] ?? null
}

const guestOr = (match: GuestMatch, build: (id: string) => Intent): Intent => {
  if (match.kind === 'one') return build(match.id)
  return match.kind === 'many' ? clarify('ambiguous_guest', match.options) : clarify('unknown_guest')
}

function parseAction(question: string, text: string, vocabulary: Vocabulary): Intent | null {
  if (/^(add (a )?)?note\b|\bnote (for|to|on)\b/.test(text)) {
    const [head = '', ...rest] = question.split(NOTE_SEPARATOR)
    const note = rest.join(' - ').trim()
    if (!note) return clarify('empty_note')
    return guestOr(matchGuest(head, vocabulary), (id) => ({ tool: 'add_note', args: { guest_id: id, text: note } }))
  }
  if (/^(move|put|place|relocate|switch)\b/.test(text)) {
    const room = matchRoom(text)
    const guest = matchGuest(text, vocabulary)
    if (guest.kind !== 'one') return guestOr(guest, () => HELP)
    if (!room || !vocabulary.rooms.includes(room)) return clarify('unknown_room')
    return { tool: 'propose_room_move', args: { guest_id: guest.id, room_number: room } }
  }
  if (/^(assign|send)\b|\bpicks? up\b/.test(text)) {
    const driver = matchDriver(text, vocabulary)
    if (!driver) return clarify('unknown_driver', vocabulary.drivers.map((item) => item.name))
    return guestOr(matchGuest(withoutWords(question, driver.named), vocabulary), (id) => ({ tool: 'propose_driver_assignment', args: { guest_id: id, driver_id: driver.id } }))
  }
  return null
}

function arrivalsWindow(text: string): { window: ArrivalWindow; hours: number | null } {
  if (/\btomorrow\b/.test(text)) return { window: 'tomorrow', hours: null }
  const hours = text.match(/\bnext (\d{1,2}) hours?\b/)
  if (hours) return { window: 'next_hours', hours: Number(hours[1]) }
  if (/\bnext hour\b/.test(text)) return { window: 'next_hours', hours: DEFAULT_HOURS }
  return { window: 'today', hours: null }
}

function arrivalsFilter(text: string): ArrivalFilter {
  if (NO_TRANSPORT.test(text)) return 'missing_driver'
  if (ROOM_NOT_READY.test(text)) return 'room_not_ready'
  if (/\bdelay/.test(text)) return 'delayed'
  return 'all'
}

const arrivals = (text: string): Intent => ({ tool: 'find_arrivals', args: { ...arrivalsWindow(text), filter: arrivalsFilter(text) } })

/** Rooms that are not ready are the cleaning queue; otherwise the free rooms or the summary. */
function rooms(text: string): Intent {
  if (ROOM_NOT_READY.test(text)) return CLEANING_QUEUE
  return { tool: 'list_rooms', args: { filter: FREE.test(text) && !NOT_FREE.test(text) ? 'free' : 'all' } }
}

function parseQuestion(question: string, text: string, vocabulary: Vocabulary): Intent {
  const flight = matchFlight(question, vocabulary)
  if (flight && /\b(affect|impact)/.test(text)) return { tool: 'who_is_affected', args: { flight_number: flight } }
  if (flight) return { tool: 'get_flight_status', args: { flight_number: flight } }
  if (/\b(pending|decisions?|approvals?)\b|waiting for (me|my)\b/.test(text)) return { tool: 'get_pending_decisions', args: {} }
  const arriving = ARRIVING.test(text)
  if (CLEANING.test(text) && !(arriving && OWN_ROOM.test(text))) return CLEANING_QUEUE
  if (/\b(programme|program|agenda|schedule|sessions?|briefing|ceremony)\b/.test(text)) {
    return { tool: 'get_program', args: { day: /\btomorrow\b/.test(text) ? 'tomorrow' : 'today', filter: /\b(risk|late)\b/.test(text) ? 'at_risk' : 'all' } }
  }
  const guest = matchGuest(question, vocabulary)
  if (guest.kind === 'one') return { tool: 'get_guest', args: { guest_id: guest.id } }
  if (guest.kind === 'many') return clarify('ambiguous_guest', guest.options)
  if (arriving) return arrivals(text)
  if (/\bpick ?ups?\b/.test(text)) return { tool: 'list_pickups', args: { filter: /\b(need|without|no|unassigned|missing)\b/.test(text) ? 'unassigned' : 'all' } }
  // A guest with no car is an arrival without a driver, even when the question never says "arriving".
  if (NO_TRANSPORT.test(text)) return arrivals(text)
  if (/\brooms?\b/.test(text)) return rooms(text)
  return HELP
}

export function parseIntent(question: string, vocabulary: Vocabulary): Intent {
  const text = normalize(question).trim().replace(POLITE_OPENER, '')
  if (!text) return HELP
  return parseAction(question, text, vocabulary) ?? parseQuestion(question, text, vocabulary)
}
