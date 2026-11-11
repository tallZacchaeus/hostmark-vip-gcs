// Rule-based checks (FR-IN-06) and the high-confidence gate (PRD P1): a submission is processed
// automatically only when it has no error or warning and no likely duplicate. Notes ("info") are
// shown to the coordinator but never block (e.g. unnamed companions become placeholders, FR-IN-09).
// Nothing here asks the AI how confident it is.
import { airlineMatchesCode } from './airlines'
import type { DuplicateKind } from './duplicates'
import type { Extraction } from './extraction'
import type { NormalizedIntake } from './normalize'
import { FLIGHT_NUMBER, type IntakeFields, requiredFieldProblems } from './schema'
import { type EventDates, isInTravelWindow, travelWindow } from './travel-window'

export type IssueSeverity = 'error' | 'warning' | 'info'

export interface IntakeIssue {
  readonly code: string
  readonly field?: string
  readonly severity: IssueSeverity
  readonly message: string
}

export type EventWindow = EventDates

function contactIssues(fields: IntakeFields, intake: NormalizedIntake): IntakeIssue[] {
  if (fields.contact_phone && !intake.contact_phone) {
    return [{ code: 'phone_invalid', field: 'contact_phone', severity: 'warning', message: 'The phone number does not look valid' }]
  }
  return []
}

function flightIssues(fields: IntakeFields, intake: NormalizedIntake): IntakeIssue[] {
  if (intake.arrival_mode !== 'flying' || !fields.flight_number) return []
  if (!intake.flight_number || !FLIGHT_NUMBER.test(intake.flight_number)) {
    return [{ code: 'flight_number_invalid', field: 'flight_number', severity: 'error', message: `"${fields.flight_number}" is not a flight number (they look like EK783)` }]
  }
  const matches = intake.airline_iata ? airlineMatchesCode(fields.airline, intake.airline_iata) : null
  return matches === false
    ? [{ code: 'airline_mismatch', field: 'airline', severity: 'warning', message: `${intake.flight_number} is not a ${fields.airline} flight number` }]
    : []
}

const TRAVEL_DATES = [
  ['arrival_date', 'arrival'],
  ['departure_date', 'departure'],
] as const

function dateIssues(intake: NormalizedIntake, event: EventWindow): IntakeIssue[] {
  const window = travelWindow(event)
  return TRAVEL_DATES.flatMap(([field, name]) => {
    const day = intake[field]
    if (!day || isInTravelWindow(day, window)) return []
    return [{ code: `${name}_outside_window`, field, severity: 'warning' as const, message: `The ${name} date is outside the travel dates (${window.from} to ${window.to})` }]
  })
}

function partyIssues(intake: NormalizedIntake): IntakeIssue[] {
  const unnamed = intake.party.filter((member) => !member.name).length
  return unnamed
    ? [{ code: 'member_names_missing', field: 'party', severity: 'info', message: `${unnamed} of ${intake.party.length} people travelling with the guest have no name yet` }]
    : []
}

function extractionIssues(intake: NormalizedIntake, extraction: Extraction): IntakeIssue[] {
  if (intake.others && extraction.method === 'none') {
    return [{ code: 'others_not_read', field: 'others', severity: 'warning', message: 'The "anything else" note could not be read automatically; check it by hand' }]
  }
  const unavailable: IntakeIssue[] = extraction.error
    ? [{ code: 'ai_unavailable', field: 'others', severity: 'warning', message: 'The free text could not be read reliably by the AI; check it by hand' }]
    : []
  return unavailable.concat(extraction.items
    .filter((item) => item.needs_attention || item.conflicts_with)
    .map((item) => ({
      code: item.conflicts_with ? 'others_conflict' : 'others_needs_attention',
      field: item.conflicts_with ?? 'others',
      severity: 'warning' as const,
      message: item.conflicts_with ? `Contradicts the form (${item.conflicts_with.replace(/_/g, ' ')}): ${item.detail}` : `Check: ${item.detail}`,
    })))
}

export function validateIntake(fields: IntakeFields, intake: NormalizedIntake, event: EventWindow, extraction: Extraction): IntakeIssue[] {
  const missing = requiredFieldProblems(fields).map((problem) => ({
    code: `missing_${problem.path}`,
    field: problem.path,
    severity: 'error' as const,
    message: problem.message,
  }))
  return [
    ...missing,
    ...contactIssues(fields, intake),
    ...flightIssues(fields, intake),
    ...dateIssues(intake, event),
    ...partyIssues(intake),
    ...extractionIssues(intake, extraction),
  ]
}

export function hasBlockingIssues(issues: readonly IntakeIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error')
}

/** PRD P1: every check passed, nothing flagged, no likely duplicate. */
export function isHighConfidence(issues: readonly IntakeIssue[], duplicate: DuplicateKind): boolean {
  return issues.every((issue) => issue.severity === 'info') && duplicate === 'none'
}
