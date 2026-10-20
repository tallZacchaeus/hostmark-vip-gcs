import { describe, expect, it } from 'vitest'
import { type MatchDriver, type MatchShift, type MatchTrip, matchDrivers, tripWindow, unavailability } from './matcher'

const TRAVEL = { airport_travel_min: 60, local_travel_min: 30 }
const driver = (id: string, capacity: number, extra: Partial<MatchDriver> = {}): MatchDriver => ({ id, full_name: id, vehicle_label: null, vehicle_capacity: capacity, is_active: true, ...extra })
const DAY_SHIFT = (id: string): MatchShift => ({ driver_id: id, starts_at: '2026-10-28T05:00:00Z', ends_at: '2026-10-28T21:00:00Z' })
const need = (overrides: Partial<Parameters<typeof matchDrivers>[0]> = {}) => ({
  pickup_id: 'p1',
  pickup_at: '2026-10-28T13:10:00Z',
  kind: 'airport' as const,
  passenger_count: 2,
  current_driver_ids: [] as string[],
  ...overrides,
})

describe('tripWindow and unavailability', () => {
  it('spans the drive there and back', () => {
    expect(tripWindow('2026-10-28T13:00:00Z', 'airport', TRAVEL)).toEqual({ start: Date.parse('2026-10-28T12:00:00Z'), end: Date.parse('2026-10-28T14:00:00Z') })
  })

  it('needs an active driver, a shift covering the whole window and no overlapping trip', () => {
    const window = tripWindow('2026-10-28T13:00:00Z', 'airport', TRAVEL)
    const trips: MatchTrip[] = [{ pickup_id: 'other', driver_id: 'busy', pickup_at: '2026-10-28T13:30:00Z', kind: 'airport' }]
    const shifts = [DAY_SHIFT('ok'), DAY_SHIFT('busy'), { driver_id: 'late', starts_at: '2026-10-28T12:30:00Z', ends_at: '2026-10-28T20:00:00Z' }]
    expect(unavailability(driver('ok', 4), window, shifts, trips, TRAVEL, 'p1')).toBeNull()
    expect(unavailability(driver('busy', 4), window, shifts, trips, TRAVEL, 'p1')).toBe('busy')
    expect(unavailability(driver('busy', 4), window, shifts, trips, TRAVEL, 'other')).toBeNull()
    expect(unavailability(driver('late', 4), window, shifts, trips, TRAVEL, 'p1')).toBe('off_shift')
    expect(unavailability(driver('ok', 4, { is_active: false }), window, shifts, trips, TRAVEL, 'p1')).toBe('inactive')
  })
})

describe('matchDrivers', () => {
  const drivers = [driver('bus', 18), driver('car', 4), driver('suv', 6)]
  const shifts = drivers.map((item) => DAY_SHIFT(item.id))

  it('keeps the current driver when they can still make it', () => {
    expect(matchDrivers(need({ current_driver_ids: ['bus'] }), drivers, shifts, [], TRAVEL)).toEqual({ driver_ids: ['bus'], alternatives: [], kept: true })
  })

  it('prefers the smallest vehicle that fits, then offers alternatives', () => {
    expect(matchDrivers(need(), drivers, shifts, [], TRAVEL)).toEqual({ driver_ids: ['car'], alternatives: ['suv', 'bus'], kept: false })
    expect(matchDrivers(need({ passenger_count: 5 }), drivers, shifts, [], TRAVEL)?.driver_ids).toEqual(['suv'])
  })

  it('balances the day: fewer jobs first, then the smallest idle gap', () => {
    const trips: MatchTrip[] = [
      { pickup_id: 'morning', driver_id: 'car', pickup_at: '2026-10-28T08:00:00Z', kind: 'airport' },
      { pickup_id: 'late-morning', driver_id: 'suv', pickup_at: '2026-10-28T10:30:00Z', kind: 'airport' },
    ]
    const cars = [driver('car', 4), driver('suv', 4), driver('spare', 4)]
    expect(matchDrivers(need(), cars, cars.map((item) => DAY_SHIFT(item.id)), trips, TRAVEL)?.driver_ids).toEqual(['spare'])
    expect(matchDrivers(need(), cars.slice(0, 2), cars.map((item) => DAY_SHIFT(item.id)), trips, TRAVEL)?.driver_ids).toEqual(['suv'])
  })

  it('reassigns when the current driver became busy, and splits a large party across vehicles', () => {
    const trips: MatchTrip[] = [{ pickup_id: 'other', driver_id: 'bus', pickup_at: '2026-10-28T13:00:00Z', kind: 'airport' }]
    expect(matchDrivers(need({ current_driver_ids: ['bus'] }), drivers, shifts, trips, TRAVEL)).toMatchObject({ driver_ids: ['car'], kept: false })
    expect(matchDrivers(need({ passenger_count: 9 }), drivers, shifts, trips, TRAVEL)).toEqual({ driver_ids: ['suv', 'car'], alternatives: [], kept: false })
    expect(matchDrivers(need({ passenger_count: 40 }), drivers, shifts, [], TRAVEL)).toBeNull()
  })
})
