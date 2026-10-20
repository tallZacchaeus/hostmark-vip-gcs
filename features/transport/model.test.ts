import { describe, expect, it } from 'vitest'
import { nowPosition, offShiftSpans, placeTrip, ticks, toRange, vehicleLine } from './model'

const range = toRange({ start: '2026-11-20T07:00:00.000Z', end: '2026-11-20T19:00:00.000Z' })

describe('transport board layout', () => {
  it('places a trip window on the timeline', () => {
    expect(placeTrip(range, { window_start: '2026-11-20T10:00:00.000Z', window_end: '2026-11-20T13:00:00.000Z' })).toEqual({ left: 25, width: 25 })
  })

  it('labels every two hours on a 12-hour board, every hour on a short one', () => {
    expect(ticks(range).map((tick) => Math.round(tick.left))).toEqual([0, 17, 33, 50, 67, 83, 100])
    const short = toRange({ start: '2026-11-20T08:00:00.000Z', end: '2026-11-20T12:00:00.000Z' })
    expect(ticks(short)).toHaveLength(5)
  })

  it('shows the now line only inside the board', () => {
    expect(nowPosition(range, new Date('2026-11-20T13:00:00Z'))).toBe(50)
    expect(nowPosition(range, new Date('2026-11-21T13:00:00Z'))).toBeNull()
    expect(nowPosition(range, null)).toBeNull()
  })

  it('shades the time outside shifts, or the whole row without one', () => {
    expect(offShiftSpans(range, [])).toEqual([{ left: 0, width: 100 }])
    expect(offShiftSpans(range, [{ starts_at: '2026-11-20T10:00:00.000Z', ends_at: '2026-11-20T16:00:00.000Z' }])).toEqual([
      { left: 0, width: 25 },
      { left: 75, width: 25 },
    ])
    expect(offShiftSpans(range, [{ starts_at: '2026-11-20T06:00:00.000Z', ends_at: '2026-11-20T20:00:00.000Z' }])).toEqual([])
  })

  it('describes the vehicle', () => {
    expect(vehicleLine({ vehicle_label: 'Prado SUV', vehicle_capacity: 6 })).toBe('Prado SUV · 6 seats')
    expect(vehicleLine({ vehicle_label: null, vehicle_capacity: 1 })).toBe('1 seat')
  })
})
