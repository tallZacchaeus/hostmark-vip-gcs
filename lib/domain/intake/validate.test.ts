import { describe, expect, it } from 'vitest'
import { EMPTY_EXTRACTION, type Extraction } from './extraction'
import { normalizeIntake } from './normalize'
import { type IntakeFields, intakeFieldsSchema } from './schema'
import { hasBlockingIssues, isHighConfidence, validateIntake } from './validate'

const EVENT = { starts_on: '2026-10-29', ends_on: '2026-10-31', intake_window_days: 3 }
const BASE = {
  full_name: 'Augustine Okafor',
  contact_name: 'Grace Okafor',
  contact_email: 'grace@example.com',
  arrival_mode: 'flying',
  airline: 'Emirates',
  flight_number: 'EK783',
  arrival_date: '2026-10-28',
  departure_date: '2026-10-31',
}

function check(overrides: Record<string, unknown> = {}, extraction: Extraction = EMPTY_EXTRACTION) {
  const fields: IntakeFields = intakeFieldsSchema.parse({ ...BASE, ...overrides })
  return validateIntake(fields, normalizeIntake(fields, 'Africa/Lagos'), EVENT, extraction)
}

const codes = (overrides: Record<string, unknown> = {}, extraction?: Extraction) => check(overrides, extraction).map((issue) => issue.code)

describe('validateIntake', () => {
  it('passes a clean submission', () => {
    expect(check()).toEqual([])
  })

  it('reports missing required fields as errors', () => {
    const issues = check({ full_name: '' })
    expect(issues.map((issue) => issue.code)).toEqual(['missing_full_name'])
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  it('rejects a malformed flight number and warns on an airline mismatch', () => {
    expect(codes({ flight_number: 'flight 7' })).toEqual(['flight_number_invalid'])
    expect(codes({ airline: 'Kenya Airways' })).toEqual(['airline_mismatch'])
    expect(codes({ airline: 'Some Unknown Carrier', flight_number: 'ZZ100' })).toEqual([])
  })

  it('warns on an unusable phone and an arrival outside the event window', () => {
    expect(codes({ contact_phone: '12' })).toEqual(['phone_invalid'])
    expect(codes({ arrival_date: '2026-10-20' })).toEqual(['arrival_outside_window'])
  })

  it('flags travel dates outside the window: from N days before the event to N days after it ends', () => {
    // Arrange: the event runs 29–31 Oct with a 3-day window, so 26 Oct to 3 Nov.
    // Act / Assert
    expect(codes({ arrival_date: '2026-10-26', departure_date: '2026-11-03' })).toEqual([])
    expect(codes({ departure_date: '2026-11-04' })).toEqual(['departure_outside_window'])
    expect(codes({ arrival_date: '2026-10-25', departure_date: '2026-11-10' })).toEqual(['arrival_outside_window', 'departure_outside_window'])
    expect(check({ departure_date: '2026-11-04' })[0]?.message).toBe('The departure date is outside the travel dates (2026-10-26 to 2026-11-03)')
  })

  it('warns when people in the party have no name', () => {
    expect(codes({ party: [{ role: 'security' }, { name: 'Ike', role: 'family' }] })).toEqual(['member_names_missing'])
  })

  it('turns flagged and contradicting extracted items into warnings', () => {
    const extraction: Extraction = {
      method: 'rules',
      items: [
        { category: 'dietary', detail: 'Vegetarian', needs_attention: false, conflicts_with: null },
        { category: 'medical', detail: 'Peanut allergy', needs_attention: true, conflicts_with: null },
        { category: 'schedule', detail: 'Now on ET901', needs_attention: true, conflicts_with: 'flight_number' },
      ],
    }
    expect(codes({ others: 'x' }, extraction)).toEqual(['others_needs_attention', 'others_conflict'])
  })

  it('asks for a manual read when the note could not be extracted', () => {
    expect(codes({ others: 'Something important' })).toEqual(['others_not_read'])
  })

  it('sends a submission to review when the AI was unavailable', () => {
    const extraction: Extraction = { method: 'rules', error: 'ai_unavailable', items: [] }
    expect(codes({ others: 'Vegetarian' }, extraction)).toEqual(['ai_unavailable'])
  })
})

describe('isHighConfidence', () => {
  it('is true only with no issue and no duplicate', () => {
    expect(isHighConfidence([], 'none')).toBe(true)
    expect(isHighConfidence([], 'likely')).toBe(false)
    expect(isHighConfidence([{ code: 'phone_invalid', severity: 'warning', message: '' }], 'none')).toBe(false)
  })
})
