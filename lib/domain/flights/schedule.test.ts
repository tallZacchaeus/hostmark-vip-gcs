import { describe, expect, it } from 'vitest'
import { delayMinutes, effectiveArrival, isDelayed, nextCheckAt } from './schedule'

const NOW = new Date('2026-10-28T08:00:00Z')
const hoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000)

describe('nextCheckAt', () => {
  it('checks once at T-24h, then more often as the arrival approaches (FR-FT-03)', () => {
    expect(nextCheckAt(NOW, hoursFromNow(48), 'scheduled')?.toISOString()).toBe(hoursFromNow(24).toISOString())
    expect(nextCheckAt(NOW, hoursFromNow(10), 'scheduled')?.toISOString()).toBe(hoursFromNow(2).toISOString())
    expect(nextCheckAt(NOW, hoursFromNow(4), 'in_air')?.toISOString()).toBe(hoursFromNow(0.5).toISOString())
    expect(nextCheckAt(NOW, hoursFromNow(1), 'in_air')?.toISOString()).toBe(new Date(NOW.getTime() + 600_000).toISOString())
    expect(nextCheckAt(NOW, hoursFromNow(-0.5), 'in_air')?.toISOString()).toBe(new Date(NOW.getTime() + 600_000).toISOString())
  })

  it('stops once the flight has landed or been cancelled, and retries later without a schedule', () => {
    expect(nextCheckAt(NOW, hoursFromNow(1), 'landed')).toBeNull()
    expect(nextCheckAt(NOW, hoursFromNow(1), 'cancelled')).toBeNull()
    expect(nextCheckAt(NOW, null, 'unknown')?.toISOString()).toBe(hoursFromNow(6).toISOString())
  })
})

describe('arrival times', () => {
  const flight = { scheduled_arrival_at: '2026-10-28T12:40:00Z', estimated_arrival_at: '2026-10-28T13:25:00Z', actual_arrival_at: null, manual_arrival_at: null }

  it('prefers a manual override, then actual, estimated and scheduled', () => {
    expect(effectiveArrival(flight)?.toISOString()).toBe('2026-10-28T13:25:00.000Z')
    expect(effectiveArrival({ ...flight, manual_arrival_at: '2026-10-28T14:00:00Z' })?.toISOString()).toBe('2026-10-28T14:00:00.000Z')
    expect(effectiveArrival({ scheduled_arrival_at: null, estimated_arrival_at: null, actual_arrival_at: null, manual_arrival_at: null })).toBeNull()
  })

  it('measures the delay and applies the badge threshold (FR-FT-02)', () => {
    expect(delayMinutes(flight)).toBe(45)
    expect(isDelayed(45, 15)).toBe(true)
    expect(isDelayed(10, 15)).toBe(false)
    expect(delayMinutes({ ...flight, scheduled_arrival_at: null })).toBeNull()
  })
})
