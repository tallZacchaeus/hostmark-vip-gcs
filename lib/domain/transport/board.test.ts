import { describe, expect, it } from 'vitest'
import { arrivalStatus, boardRange, pickDay, placeBlock } from './board'

const HOUR = 60 * 60_000

describe('arrivalStatus', () => {
  it('reads cancelled and diverted flights as cancelled', () => {
    expect(arrivalStatus({ phase: 'cancelled', delay_minutes: null, arrival_status: 'expected' }, 15)).toBe('cancelled')
    expect(arrivalStatus({ phase: 'diverted', delay_minutes: 40, arrival_status: 'expected' }, 15)).toBe('cancelled')
  })

  it('counts a party as landed when the flight landed or the party has arrived', () => {
    expect(arrivalStatus({ phase: 'landed', delay_minutes: 50, arrival_status: 'expected' }, 15)).toBe('landed')
    expect(arrivalStatus({ phase: null, delay_minutes: null, arrival_status: 'arrived' }, 15)).toBe('landed')
  })

  it('marks a flight delayed from the event threshold on', () => {
    expect(arrivalStatus({ phase: 'in_air', delay_minutes: 15, arrival_status: 'expected' }, 15)).toBe('delayed')
    expect(arrivalStatus({ phase: 'in_air', delay_minutes: 14, arrival_status: 'expected' }, 15)).toBe('due')
    expect(arrivalStatus({ phase: null, delay_minutes: null, arrival_status: 'expected' }, 15)).toBe('due')
  })
})

describe('pickDay', () => {
  const days = ['2026-11-21', '2026-11-20', '2026-11-23']

  it('keeps the requested day', () => {
    expect(pickDay('2026-11-22', '2026-10-20', days)).toBe('2026-11-22')
  })

  it('shows today when something happens today, else the next busy day, else today', () => {
    expect(pickDay(undefined, '2026-11-21', days)).toBe('2026-11-21')
    expect(pickDay(undefined, '2026-10-20', days)).toBe('2026-11-20')
    expect(pickDay(undefined, '2026-11-22', days)).toBe('2026-11-23')
    expect(pickDay(undefined, '2026-12-01', days)).toBe('2026-12-01')
  })
})

describe('boardRange and placeBlock', () => {
  const dayStart = Date.UTC(2026, 10, 20)

  it('opens on the working day and widens to fit early or late trips', () => {
    expect(boardRange(dayStart, [])).toEqual({ start: dayStart + 8 * HOUR, end: dayStart + 20 * HOUR })
    const early = { start: dayStart + 5.5 * HOUR, end: dayStart + 7 * HOUR }
    const late = { start: dayStart + 21 * HOUR, end: dayStart + 22.25 * HOUR }
    expect(boardRange(dayStart, [early, late])).toEqual({ start: dayStart + 5 * HOUR, end: dayStart + 23 * HOUR })
  })

  it('places blocks as percentages and clips them to the range', () => {
    const range = { start: 0, end: 10 * HOUR }
    expect(placeBlock(range, { start: 2 * HOUR, end: 4 * HOUR })).toEqual({ left: 20, width: 20 })
    expect(placeBlock(range, { start: -HOUR, end: HOUR })).toEqual({ left: 0, width: 10 })
    expect(placeBlock(range, { start: 9 * HOUR, end: 12 * HOUR })).toEqual({ left: 90, width: 10 })
  })
})
