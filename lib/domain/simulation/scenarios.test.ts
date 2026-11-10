import { describe, expect, it } from 'vitest'
import type { TrackedFlight } from '@/lib/flights/provider'
import { SCENARIOS, type Scenario, applyChange, describeChange, dueSteps, elapsedMinutes, findScenario, flightsNeeded, stepTarget, targetsNeeded } from './scenarios'

const flight: TrackedFlight = {
  flight_number: 'KQ532',
  arrival_date_local: '2026-11-20',
  phase: 'in_air',
  scheduled_arrival_at: '2026-11-20T13:00:00Z',
  estimated_arrival_at: null,
  actual_arrival_at: null,
  manual_arrival_at: null,
  origin_iata: 'NBO',
  destination_iata: 'LOS',
}

const scenario = (key: string): Scenario => {
  const found = findScenario(key)
  if (!found) throw new Error(`No scenario ${key}`)
  return found
}

describe('scenarios', () => {
  it('have unique keys that the database accepts and steps in time order', () => {
    const keys = SCENARIOS.map((item) => item.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const item of SCENARIOS) {
      expect(item.key).toMatch(/^[a-z0-9_-]{1,50}$/)
      const times = item.steps.map((step) => step.at_min)
      expect(times).toEqual([...times].sort((a, b) => a - b))
    }
  })

  it('know how many flights they act on', () => {
    expect(flightsNeeded(scenario('single-delay'))).toBe(1)
    expect(flightsNeeded(scenario('busy-morning'))).toBe(3)
    expect(findScenario('nope')).toBeUndefined()
  })

  it('include room scenarios that act on rooms and delegations, not flights', () => {
    const outOfService = scenario('room-out-of-service')
    expect(flightsNeeded(outOfService)).toBe(0)
    expect(targetsNeeded(outOfService, 'room')).toBe(1)
    expect(outOfService.steps.map(stepTarget)).toEqual([{ kind: 'room', index: 0 }])

    const extra = scenario('extra-guests')
    expect(flightsNeeded(extra)).toBe(0)
    expect(targetsNeeded(extra, 'delegation')).toBe(1)
    expect(extra.steps[0]).toMatchObject({ delegation: 0, change: { kind: 'add_companions', count: 2 } })
  })

  it('point every step at a target the run can choose', () => {
    for (const item of SCENARIOS) {
      const needed = { flight: targetsNeeded(item, 'flight'), room: targetsNeeded(item, 'room'), delegation: targetsNeeded(item, 'delegation') }
      expect(needed.flight + needed.room + needed.delegation).toBeGreaterThan(0)
      for (const target of item.steps.map(stepTarget)) expect(target.index).toBeLessThan(needed[target.kind])
    }
  })

  it('describe each change in plain words', () => {
    expect(describeChange({ kind: 'delay', minutes: 45 })).toBe('delayed 45 min')
    expect(describeChange({ kind: 'out_of_service' })).toBe('out of service')
    expect(describeChange({ kind: 'add_companions', count: 2 })).toBe('gains 2 companions')
    expect(describeChange({ kind: 'add_companions', count: 1 })).toBe('gains 1 companion')
  })
})

describe('applyChange', () => {
  it('delays and advances from the scheduled time and leaves the phase to the provider', () => {
    expect(applyChange(flight, { kind: 'delay', minutes: 45 })).toMatchObject({ phase: 'unknown', estimated_arrival_at: '2026-11-20T13:45:00.000Z' })
    expect(applyChange({ ...flight, estimated_arrival_at: '2026-11-20T13:45:00Z' }, { kind: 'delay', minutes: 75 }).estimated_arrival_at).toBe('2026-11-20T14:15:00.000Z')
    expect(applyChange(flight, { kind: 'early', minutes: 25 }).estimated_arrival_at).toBe('2026-11-20T12:35:00.000Z')
  })

  it('cancels, diverts and lands', () => {
    expect(applyChange(flight, { kind: 'cancel' }).phase).toBe('cancelled')
    expect(applyChange(flight, { kind: 'divert' }).phase).toBe('diverted')
    const landed = applyChange({ ...flight, estimated_arrival_at: '2026-11-20T12:35:00Z' }, { kind: 'land' })
    expect(landed).toMatchObject({ phase: 'landed', actual_arrival_at: '2026-11-20T12:35:00.000Z' })
  })

  it('cannot shift a flight without a scheduled time', () => {
    expect(applyChange({ ...flight, scheduled_arrival_at: null }, { kind: 'delay', minutes: 10 }).estimated_arrival_at).toBeNull()
  })
})

describe('run clock', () => {
  const run = { real_start: '2026-11-20T10:00:00Z', speed: 60, steps_applied: 0 }

  it('runs virtual time at the chosen speed', () => {
    expect(elapsedMinutes(run, new Date('2026-11-20T10:00:10Z'))).toBe(10)
    expect(elapsedMinutes(run, new Date('2026-11-20T09:00:00Z'))).toBe(0)
  })

  it('returns the steps that are due and not yet applied', () => {
    const rolling = scenario('rolling-delays')
    expect(dueSteps(rolling, run, new Date('2026-11-20T10:00:00Z'))).toHaveLength(1)
    expect(dueSteps(rolling, run, new Date('2026-11-20T10:00:15Z'))).toHaveLength(2)
    expect(dueSteps(rolling, { ...run, steps_applied: 2 }, new Date('2026-11-20T10:00:15Z'))).toEqual([])
    expect(dueSteps(rolling, { ...run, steps_applied: 2 }, new Date('2026-11-20T10:00:20Z'))).toHaveLength(1)
  })
})
