import { describe, expect, it } from 'vitest'
import { classifyDuplicate, type DuplicateCandidate, newReferenceCode } from './duplicates'
import { normalizeIntake } from './normalize'
import { intakeFieldsSchema } from './schema'

const intake = normalizeIntake(
  intakeFieldsSchema.parse({
    full_name: 'Bishop Augustine Okafor',
    contact_email: 'grace@example.com',
    arrival_mode: 'flying',
    flight_number: 'EK783',
    arrival_date: '2026-10-28',
  }),
  'Africa/Lagos',
)

const candidate = (overrides: Partial<DuplicateCandidate>): DuplicateCandidate => ({
  delegation_id: 'd1',
  principal_name: 'Augustine Okafor',
  similarity: 1,
  flight_number: 'EK783',
  arrival_date: '2026-10-28',
  contact_email: 'grace@example.com',
  contact_phone: null,
  party_size: 0,
  departure_date: null,
  ...overrides,
})

describe('classifyDuplicate', () => {
  it('finds no duplicate when there are no candidates', () => {
    expect(classifyDuplicate(intake, [])).toEqual({ kind: 'none', delegation_id: null })
  })

  it('sends an exact match that brings new information to review instead of linking it', () => {
    expect(classifyDuplicate(intake, [candidate({ party_size: 2 })]).kind).toBe('likely')
    expect(classifyDuplicate(intake, [candidate({ departure_date: '2026-10-31' })]).kind).toBe('likely')
    const withNote = normalizeIntake(intakeFieldsSchema.parse({ full_name: 'Bishop Augustine Okafor', contact_email: 'grace@example.com', arrival_mode: 'flying', flight_number: 'EK783', arrival_date: '2026-10-28', others: 'His wife joins now' }), 'Africa/Lagos')
    expect(classifyDuplicate(withNote, [candidate({})]).kind).toBe('likely')
  })

  it('calls the same name, arrival and contact an exact duplicate', () => {
    expect(classifyDuplicate(intake, [candidate({})])).toEqual({ kind: 'exact', delegation_id: 'd1' })
    expect(classifyDuplicate(intake, [candidate({ principal_name: 'Bishop Augustine Okafor' })]).kind).toBe('exact')
  })

  it('calls a similar name with the same date, flight or contact a likely duplicate', () => {
    const similar = { principal_name: 'Augustin Okafor', similarity: 0.7 }
    expect(classifyDuplicate(intake, [candidate({ ...similar, flight_number: null, contact_email: null })]).kind).toBe('likely')
    expect(classifyDuplicate(intake, [candidate({ ...similar, arrival_date: '2026-10-27', contact_email: null })]).kind).toBe('likely')
    expect(classifyDuplicate(intake, [candidate({ contact_email: 'other@example.com' })]).kind).toBe('likely')
  })

  it('treats a partial name on the same flight as a likely duplicate', () => {
    const partial = normalizeIntake(intakeFieldsSchema.parse({ title: 'Bishop', full_name: 'Okafor', arrival_mode: 'flying', flight_number: 'EK783' }), 'Africa/Lagos')
    const result = classifyDuplicate(partial, [candidate({ similarity: 0.41, arrival_date: '2026-10-28', contact_email: null })])
    expect(result).toEqual({ kind: 'likely', delegation_id: 'd1' })
    const stranger = normalizeIntake(intakeFieldsSchema.parse({ full_name: 'Okoro', flight_number: 'EK783', arrival_mode: 'flying' }), 'Africa/Lagos')
    expect(classifyDuplicate(stranger, [candidate({ similarity: 0.35, contact_email: null })]).kind).toBe('none')
  })

  it('ignores a similar name with nothing else in common, and a dissimilar one', () => {
    const unrelated = { arrival_date: '2026-10-30', flight_number: 'BA75', contact_email: null }
    expect(classifyDuplicate(intake, [candidate({ principal_name: 'Augustin Okafor', similarity: 0.7, ...unrelated })]).kind).toBe('none')
    expect(classifyDuplicate(intake, [candidate({ principal_name: 'Ama Owusu', similarity: 0.2, contact_email: null })]).kind).toBe('none')
  })

  it('prefers the most similar likely candidate', () => {
    const result = classifyDuplicate(intake, [
      candidate({ delegation_id: 'low', principal_name: 'A Okafor', similarity: 0.62, contact_email: null }),
      candidate({ delegation_id: 'high', principal_name: 'Augustin Okafor', similarity: 0.9, contact_email: null }),
    ])
    expect(result).toEqual({ kind: 'likely', delegation_id: 'high' })
  })
})

describe('newReferenceCode', () => {
  it('builds a short code without ambiguous characters', () => {
    expect(newReferenceCode(() => new Uint8Array([0, 1, 31, 32]))).toBe('VIP-AB9A')
    expect(newReferenceCode()).toMatch(/^VIP-[A-HJ-NP-Z2-9]{4}$/)
  })
})
