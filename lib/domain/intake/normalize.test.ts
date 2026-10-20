import { describe, expect, it } from 'vitest'
import { airlineMatchesCode, airlineName } from './airlines'
import { caseName, displayName, normalizeFlightNumber, normalizeIntake, normalizePhone, splitList, splitTitle } from './normalize'
import { intakeFieldsSchema } from './schema'

describe('splitTitle', () => {
  it('splits a leading honorific from the name', () => {
    expect(splitTitle('bishop augustine okafor')).toEqual({ title: 'Bishop', name: 'Augustine Okafor' })
    expect(splitTitle('H.E. AMINA BELLO')).toEqual({ title: 'H.E.', name: 'Amina Bello' })
    expect(splitTitle('his excellency  john   doe')).toEqual({ title: 'His Excellency', name: 'John Doe' })
  })

  it('keeps a separately given title and leaves names without one alone', () => {
    expect(splitTitle('ada nwosu', 'dr')).toEqual({ title: 'Dr', name: 'Ada Nwosu' })
    expect(splitTitle('Drew Barrymore')).toEqual({ title: '', name: 'Drew Barrymore' })
  })
})

describe('caseName', () => {
  it('cases names typed in one case and keeps mixed case as typed', () => {
    expect(caseName('ngozi okonjo-iweala')).toBe('Ngozi Okonjo-Iweala')
    expect(caseName("O'BRIEN")).toBe("O'Brien")
    expect(caseName('Mary McDonald')).toBe('Mary McDonald')
  })
})

describe('normalizePhone', () => {
  it('turns local and international forms into E.164', () => {
    expect(normalizePhone('0803 555 0142')).toBe('+2348035550142')
    expect(normalizePhone('+44 (20) 7946-0958')).toBe('+442079460958')
    expect(normalizePhone('00 233 24 555 0101')).toBe('+233245550101')
  })

  it('rejects things that cannot be phone numbers', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('12')).toBeNull()
    expect(normalizePhone('call my PA')).toBeNull()
  })
})

describe('normalizeFlightNumber', () => {
  it('normalises spacing, case and leading zeros', () => {
    expect(normalizeFlightNumber('ek 783')).toBe('EK783')
    expect(normalizeFlightNumber('EK-0783')).toBe('EK783')
    expect(normalizeFlightNumber('p4 7121')).toBe('P47121')
    expect(normalizeFlightNumber('5z 101')).toBe('5Z101')
  })

  it('rejects text that is not a flight number', () => {
    expect(normalizeFlightNumber('783')).toBeNull()
    expect(normalizeFlightNumber('12345')).toBeNull()
    expect(normalizeFlightNumber('Emirates')).toBeNull()
  })
})

describe('splitList', () => {
  it('splits on commas, semicolons and "and", dropping "none"', () => {
    expect(splitList('vegetarian, no pork and halal')).toEqual(['Vegetarian', 'No pork', 'Halal'])
    expect(splitList('None')).toEqual([])
    expect(splitList('')).toEqual([])
  })
})

describe('airlines', () => {
  it('names an airline from its designator and checks the form agrees', () => {
    expect(airlineName('ek')).toBe('Emirates')
    expect(airlineName('ZZ')).toBeNull()
    expect(airlineMatchesCode('Ethiopian', 'ET')).toBe(true)
    expect(airlineMatchesCode('Emirates', 'ET')).toBe(false)
    expect(airlineMatchesCode('Emirates', 'ZZ')).toBeNull()
    expect(airlineMatchesCode('', 'EK')).toBeNull()
  })
})

describe('normalizeIntake', () => {
  it('normalises a whole form, converting the arrival to an instant in the event zone', () => {
    const fields = intakeFieldsSchema.parse({
      full_name: 'archbishop john  mensah',
      contact_name: 'grace mensah',
      contact_email: ' Grace@Example.COM ',
      contact_phone: '0803 555 0142',
      arrival_mode: 'own_transport',
      arrival_date: '2026-10-28',
      arrival_time: '14:30',
      departure_date: '2026-10-31',
      dietary: 'halal',
      party: [{ name: 'dr ike mensah', role: 'family', dietary: 'vegan' }],
    })

    const intake = normalizeIntake(fields, 'Africa/Lagos')

    expect(intake.title).toBe('Archbishop')
    expect(intake.full_name).toBe('John Mensah')
    expect(intake.contact_email).toBe('grace@example.com')
    expect(intake.contact_phone).toBe('+2348035550142')
    expect(intake.arrival_at).toBe('2026-10-28T13:30:00.000Z')
    expect(intake.dietary).toEqual(['Halal'])
    expect(intake.party).toEqual([{ title: 'Dr', name: 'Ike Mensah', role: 'family', dietary: ['Vegan'], accessibility: '' }])
    expect(displayName(intake)).toBe('Archbishop John Mensah')
  })

  it('names the airline from the flight number when the form leaves it out', () => {
    const fields = intakeFieldsSchema.parse({ full_name: 'Ama Owusu', arrival_mode: 'flying', flight_number: 'ek783' })
    const intake = normalizeIntake(fields, 'Africa/Lagos')
    expect(intake.flight_number).toBe('EK783')
    expect(intake.airline_iata).toBe('EK')
    expect(intake.airline).toBe('Emirates')
    expect(intake.arrival_at).toBeNull()
  })
})
