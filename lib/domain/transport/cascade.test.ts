import { describe, expect, it } from 'vitest'
import { type CascadeInput, planCascade } from './cascade'

const EVENT = { timezone: 'Africa/Lagos', venue_name: 'Harbour Point', arrival_airports: ['LOS'], airport_exit_buffer_min: 30, airport_travel_min: 60, local_travel_min: 45 }
const SHIFT = (id: string) => ({ driver_id: id, starts_at: '2026-10-28T05:00:00Z', ends_at: '2026-10-28T21:00:00Z' })
const DRIVERS = [
  { id: 'emeka', full_name: 'Emeka Oladipo', vehicle_label: 'Coaster', vehicle_capacity: 18, is_active: true },
  { id: 'sule', full_name: 'Sule Abdullahi', vehicle_label: 'Prado', vehicle_capacity: 6, is_active: true },
]
const LATER_TRIP = { pickup_id: 'p2', driver_id: 'emeka', pickup_at: '2026-10-28T14:30:00Z', kind: 'airport' as const }

function input(overrides: Partial<CascadeInput> = {}): CascadeInput {
  return {
    event: EVENT,
    flight: { id: 'f1', flight_number: 'EK783', phase: 'in_air', scheduled_arrival_at: '2026-10-28T12:40:00Z', estimated_arrival_at: '2026-10-28T13:25:00Z', actual_arrival_at: null, manual_arrival_at: null },
    arrivals: [{ id: 'a1', delegation_name: 'Bishop Augustine Okafor', expected_at_venue_at: '2026-10-28T14:10:00Z', passenger_count: 4 }],
    pickups: [{ id: 'p1', arrival_id: 'a1', kind: 'airport', pickup_at: '2026-10-28T13:10:00Z', pickup_location: 'LOS airport, arrivals', status: 'assigned', passenger_count: 4, driver_ids: ['emeka'] }],
    drivers: DRIVERS,
    shifts: DRIVERS.map((item) => SHIFT(item.id)),
    trips: [{ pickup_id: 'p1', driver_id: 'emeka', pickup_at: '2026-10-28T13:10:00Z', kind: 'airport' }],
    ...overrides,
  }
}

describe('planCascade', () => {
  it('moves the arrival and pickup, and keeps a driver who can still make it (FR-FT-04/05/07)', () => {
    const plan = planCascade(input())
    expect(plan.arrivals).toEqual([{ id: 'a1', expected_at_venue_at: '2026-10-28T14:55:00.000Z', attention: null }])
    expect(plan.pickup_times).toEqual([{ id: 'p1', pickup_at: '2026-10-28T13:55:00.000Z', previous_pickup_at: '2026-10-28T13:10:00Z' }])
    expect(plan.kept).toEqual([{ pickup_id: 'p1', driver_ids: ['emeka'], pickup_at: '2026-10-28T13:55:00.000Z' }])
    expect(plan.proposals).toEqual([])
  })

  it('proposes a reassignment when the driver is busy at the new time', () => {
    const plan = planCascade(input({ trips: [...input().trips, LATER_TRIP] }))
    expect(plan.proposals).toEqual([
      expect.objectContaining({ kind: 'driver_reassignment', pickup_id: 'p1', driver_ids: ['sule'], title: 'Reassign the 14:55 pickup for Bishop Augustine Okafor' }),
    ])
    expect(plan.proposals[0]?.summary).toContain('45 min late')
  })

  it('tells the coordinator when nobody can take the trip', () => {
    const plan = planCascade(input({ drivers: [DRIVERS[0] as (typeof DRIVERS)[number]], shifts: [SHIFT('emeka')], trips: [...input().trips, LATER_TRIP] }))
    expect(plan.alerts).toEqual([{ pickup_id: 'p1', title: 'No driver can take the 14:55 pickup for Bishop Augustine Okafor' }])
  })

  it('flags a cancellation and proposes releasing the pickup (FR-FT-08)', () => {
    const plan = planCascade(input({ flight: { ...input().flight, phase: 'cancelled' } }))
    expect(plan.arrivals[0]?.attention).toBe('Flight EK783 cancelled')
    expect(plan.proposals.map((proposal) => [proposal.kind, proposal.pickup_id])).toEqual([['release_pickup', 'p1']])
    expect(plan.pickup_times).toEqual([])
  })

  it('books a pickup once a landing time is known, with a proposed driver', () => {
    const plan = planCascade(input({ pickups: [], trips: [] }))
    expect(plan.new_pickups).toEqual([{ arrival_id: 'a1', pickup_location: 'LOS airport, arrivals', dropoff_location: 'Harbour Point', pickup_at: '2026-10-28T13:55:00.000Z', passenger_count: 4 }])
    expect(plan.proposals).toEqual([expect.objectContaining({ kind: 'driver_assignment', pickup_id: null, new_pickup_index: 0, driver_ids: ['sule'] })])
  })

  it('leaves trips alone once the driver is on the way, and ignores changes under a minute', () => {
    const [pickup] = input().pickups
    expect(planCascade(input({ pickups: [{ ...(pickup as NonNullable<typeof pickup>), status: 'en_route' }] })).pickup_times).toEqual([])
    const tiny = input({ flight: { ...input().flight, estimated_arrival_at: '2026-10-28T12:40:20Z' } })
    expect(planCascade(tiny).pickup_times).toEqual([])
  })
})
