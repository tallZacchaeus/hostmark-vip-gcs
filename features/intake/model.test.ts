import { describe, expect, it } from 'vitest'
import { completeFields, fieldMessages, guestName, reasonsOf } from './model'

describe('reasonsOf', () => {
  it('summarises why a submission is waiting', () => {
    const issues = [
      { code: 'missing_departure_date', field: 'departure_date', severity: 'error' as const, message: 'Enter the departure date' },
      { code: 'others_needs_attention', field: 'others', severity: 'warning' as const, message: 'Check: allergy' },
    ]
    expect(reasonsOf(issues, 'likely').map((reason) => reason.label)).toEqual(['Likely duplicate', 'Missing details', 'Flagged in note'])
  })

  it('ignores notes that never block', () => {
    expect(reasonsOf([{ code: 'member_names_missing', field: 'party', severity: 'info', message: '' }], 'none')).toEqual([])
  })
})

describe('fieldMessages', () => {
  it('keeps one message per field, errors first', () => {
    const messages = fieldMessages([
      { code: 'airline_mismatch', field: 'flight_number', severity: 'warning', message: 'Not an Emirates number' },
      { code: 'flight_number_invalid', field: 'flight_number', severity: 'error', message: 'Not a flight number' },
      { code: 'x', severity: 'warning', message: 'No field' },
    ])
    expect(messages).toEqual({ flight_number: 'Not a flight number' })
  })
})

describe('completeFields', () => {
  it('fills every field so inputs stay controlled', () => {
    const fields = completeFields({ full_name: 'Ama', party: [{ name: 'Kofi', role: 'family' } as never] })
    expect(fields.contact_email).toBe('')
    expect(fields.party).toEqual([{ name: 'Kofi', role: 'family', dietary: '', accessibility: '' }])
    expect(completeFields(null).party).toEqual([])
  })
})

describe('guestName', () => {
  it('joins a title and a name, with a fallback', () => {
    expect(guestName('Bishop', 'Augustine Okafor')).toBe('Bishop Augustine Okafor')
    expect(guestName(null, '')).toBe('Unnamed guest')
  })
})
