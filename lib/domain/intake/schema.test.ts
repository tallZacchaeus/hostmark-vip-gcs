import { describe, expect, it } from 'vitest'
import { intakeFieldsSchema, intakeFormSchema, MAX_PARTY_SIZE, publicRegistrationSchema, requiredFieldProblems } from './schema'

const COMPLETE_FLYING = {
  full_name: 'Bishop Augustine Okafor',
  contact_name: 'Grace Okafor',
  contact_email: 'grace@example.com',
  arrival_mode: 'flying',
  airline: 'Emirates',
  flight_number: 'EK783',
  arrival_date: '2026-10-28',
  departure_date: '2026-10-31',
}

const pathsOf = (fields: Record<string, unknown>) => requiredFieldProblems(intakeFieldsSchema.parse(fields)).map((problem) => problem.path)

describe('requiredFieldProblems', () => {
  it('accepts a complete flying form', () => {
    expect(pathsOf(COMPLETE_FLYING)).toEqual([])
  })

  it('reports every missing field on an empty form', () => {
    expect(pathsOf({})).toEqual(['full_name', 'contact_name', 'contact_email', 'arrival_mode', 'arrival_date', 'departure_date'])
  })

  it('requires the fields of the chosen arrival mode', () => {
    expect(pathsOf({ ...COMPLETE_FLYING, flight_number: '', airline: '' })).toEqual(['flight_number', 'airline'])
    expect(pathsOf({ ...COMPLETE_FLYING, arrival_mode: 'own_transport' })).toEqual(['arrival_time'])
    expect(pathsOf({ ...COMPLETE_FLYING, arrival_mode: 'pickup' })).toEqual(['pickup_address', 'arrival_time'])
  })

  it('accepts a phone instead of an email, but not a malformed email', () => {
    expect(pathsOf({ ...COMPLETE_FLYING, contact_email: '', contact_phone: '08035550142' })).toEqual([])
    expect(pathsOf({ ...COMPLETE_FLYING, contact_email: 'grace-at-example' })).toEqual(['contact_email'])
    // Characters that would change a mailto: link are refused.
    expect(pathsOf({ ...COMPLETE_FLYING, contact_email: 'a@b.co?bcc=x@evil.example' })).toEqual(['contact_email'])
  })

  it('rejects a departure before the arrival', () => {
    expect(pathsOf({ ...COMPLETE_FLYING, departure_date: '2026-10-27' })).toEqual(['departure_date'])
  })
})

describe('intakeFormSchema', () => {
  it('turns each problem into a field issue', () => {
    const result = intakeFormSchema.safeParse({ ...COMPLETE_FLYING, full_name: '  ' })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['full_name'])
  })

  it('caps the party size and rejects a malformed time', () => {
    const party = Array.from({ length: MAX_PARTY_SIZE + 1 }, () => ({ role: 'other' }))
    expect(intakeFormSchema.safeParse({ ...COMPLETE_FLYING, party }).success).toBe(false)
    expect(intakeFormSchema.safeParse({ ...COMPLETE_FLYING, arrival_time: '25:00' }).success).toBe(false)
  })

  it('has no VIP category field for the guest to set (FR-IN-11)', () => {
    const parsed = intakeFormSchema.parse({ ...COMPLETE_FLYING, category: 'VVIP' })
    expect(parsed).not.toHaveProperty('category')
  })
})

describe('publicRegistrationSchema', () => {
  it('requires consent', () => {
    expect(publicRegistrationSchema.safeParse({ form: COMPLETE_FLYING, consent: false }).success).toBe(false)
    expect(publicRegistrationSchema.safeParse({ form: COMPLETE_FLYING, consent: true }).success).toBe(true)
  })
})
