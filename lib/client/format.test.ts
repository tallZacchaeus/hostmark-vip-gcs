import { describe, expect, it } from 'vitest'
import {
  addDays,
  dateKey,
  firstName,
  formatDay,
  formatDayTime,
  formatDelay,
  formatIsoDate,
  formatLongDay,
  formatShortDay,
  formatTime,
  greeting,
  initials,
  minutesBetween,
  plural,
  zonedDateTime,
  zonedDayStart,
} from './format'

const LAGOS = 'Africa/Lagos'
// 10:20 UTC = 11:20 in Lagos (UTC+1).
const INSTANT = '2026-10-28T10:20:00Z'

describe('time and date formatting', () => {
  it('shows times on a 24-hour clock in the event zone', () => {
    expect(formatTime(INSTANT, LAGOS)).toBe('11:20')
    expect(formatTime('2026-10-28T22:05:00Z', LAGOS)).toBe('23:05')
    expect(formatTime(new Date('2026-10-28T23:30:00Z'), LAGOS)).toBe('00:30')
  })

  it('formats days in the event zone', () => {
    expect(formatDay(INSTANT, LAGOS)).toBe('Wed, 28 Oct 2026')
    expect(formatShortDay(INSTANT, LAGOS)).toBe('Wed 28 Oct')
    expect(formatLongDay(INSTANT, LAGOS)).toBe('Wednesday 28 October')
    expect(formatDayTime(INSTANT, LAGOS)).toBe('Wed 28 Oct 11:20')
  })

  it('uses the event zone to decide the calendar date', () => {
    expect(dateKey('2026-10-28T23:30:00Z', LAGOS)).toBe('2026-10-29')
    expect(dateKey('2026-10-28T23:30:00Z', 'UTC')).toBe('2026-10-28')
  })

  it('finds when a calendar day starts in the event zone', () => {
    expect(zonedDayStart('2026-10-28', LAGOS)).toBe('2026-10-27T23:00:00.000Z')
    expect(zonedDayStart('2026-10-28', 'UTC')).toBe('2026-10-28T00:00:00.000Z')
    // London leaves summer time on 25 Oct 2026: the day starts at 00:00 UTC on the 26th.
    expect(zonedDayStart('2026-10-26', 'Europe/London')).toBe('2026-10-26T00:00:00.000Z')
    expect(zonedDayStart('2026-10-24', 'Europe/London')).toBe('2026-10-23T23:00:00.000Z')
  })

  it('turns an event-local date and time into an instant', () => {
    expect(zonedDateTime('2026-10-28', '14:30', LAGOS)).toBe('2026-10-28T13:30:00.000Z')
    expect(zonedDateTime('2026-10-28', '00:00', 'UTC')).toBe('2026-10-28T00:00:00.000Z')
  })

  it('adds days to calendar dates', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('never shifts date-only values', () => {
    expect(formatIsoDate('2026-10-28')).toBe('Wed 28 Oct')
  })

  it('measures and formats delays', () => {
    expect(minutesBetween('2026-10-28T13:40:00Z', '2026-10-28T14:25:00Z')).toBe(45)
    expect(formatDelay(45)).toBe('+45 min')
    expect(formatDelay(-10)).toBe('-10 min')
    expect(formatDelay(60)).toBe('+1 h')
    expect(formatDelay(65)).toBe('+1 h 05 min')
  })

  it('greets by the hour in the event zone', () => {
    expect(greeting(INSTANT, LAGOS)).toBe('Good morning')
    expect(greeting('2026-10-28T13:00:00Z', LAGOS)).toBe('Good afternoon')
    expect(greeting('2026-10-28T19:00:00Z', LAGOS)).toBe('Good evening')
  })
})

describe('text helpers', () => {
  it('builds initials from the first and last name, skipping titles', () => {
    expect(initials('Ada Nwosu')).toBe('AN')
    expect(initials('Dr. Ngozi Chiamaka Eze')).toBe('NE')
    expect(initials('Emeka')).toBe('E')
    expect(initials('   ')).toBe('')
  })

  it('pluralises counts', () => {
    expect(plural(1, 'guest')).toBe('1 guest')
    expect(plural(3, 'guest')).toBe('3 guests')
    expect(plural(2, 'party', 'parties')).toBe('2 parties')
  })

  it('takes the first name', () => {
    expect(firstName('Ada Nwosu')).toBe('Ada')
    expect(firstName('Chioma')).toBe('Chioma')
  })
})
