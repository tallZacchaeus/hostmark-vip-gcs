import { describe, expect, it } from 'vitest'
import { simulationClock, systemClock, virtualNow } from './clock'

describe('clock', () => {
  it('reads real time from the system clock', () => {
    const before = Date.now()
    const now = systemClock.now().getTime()
    expect(now).toBeGreaterThanOrEqual(before)
  })

  it('runs virtual time faster than real time by the configured speed', () => {
    const config = {
      virtualStart: new Date('2026-11-20T08:00:00Z'),
      realStart: new Date('2026-10-16T10:00:00Z'),
      speed: 60,
    }
    // 6 real minutes at x60 = 6 virtual hours (the F11 demo in 03-App-Flow.md).
    const sixRealMinutesLater = new Date('2026-10-16T10:06:00Z')
    expect(virtualNow(config, sixRealMinutesLater).toISOString()).toBe('2026-11-20T14:00:00.000Z')
  })

  it('wraps another clock for simulated mode', () => {
    const fixed = { now: () => new Date('2026-10-16T10:01:00Z') }
    const clock = simulationClock(
      { virtualStart: new Date('2026-11-20T08:00:00Z'), realStart: new Date('2026-10-16T10:00:00Z'), speed: 2 },
      fixed,
    )
    expect(clock.now().toISOString()).toBe('2026-11-20T08:02:00.000Z')
  })

  it('rejects speeds outside the supported range', () => {
    const base = { virtualStart: new Date(), realStart: new Date() }
    expect(() => virtualNow({ ...base, speed: 0 }, new Date())).toThrow(RangeError)
    expect(() => virtualNow({ ...base, speed: 10_000 }, new Date())).toThrow(RangeError)
  })
})
