import { describe, expect, it } from 'vitest'
import { simulateTurnaround, type TurnaroundOptions } from './cleaning'

const base: TurnaroundOptions = { seed: 7, checkouts: 30, cleaners: 3, bufferMinutes: 15, spreadMinutes: 300, durationFactor: [0.8, 1.3] }

describe('simulateTurnaround', () => {
  it('is repeatable for a seed', () => {
    expect(simulateTurnaround(base)).toEqual(simulateTurnaround(base))
  })

  it('has an error of exactly the buffer when nobody waits and cleans take their nominal time', () => {
    const result = simulateTurnaround({ ...base, checkouts: 5, cleaners: 5, durationFactor: [1, 1] })
    expect(result.rooms).toBe(5)
    expect(result.maeMinutes).toBe(15)
  })

  it('gets worse with fewer cleaners', () => {
    expect(simulateTurnaround({ ...base, cleaners: 1 }).maeMinutes).toBeGreaterThan(simulateTurnaround({ ...base, cleaners: 4 }).maeMinutes)
  })
})
