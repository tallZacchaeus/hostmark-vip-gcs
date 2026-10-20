import { describe, expect, it } from 'vitest'
import { type DriverTrip, changeNotice, flightStatus, nextStep, partyLabel, progressLabel, splitDay } from './model'

const trip = (overrides: Partial<DriverTrip> = {}): DriverTrip => ({
  assignment_id: 'a1',
  status: 'active',
  acknowledged_at: '2026-11-20T08:00:00Z',
  en_route_at: null,
  picked_up_at: null,
  completed_at: null,
  released_at: null,
  pickup_id: 'p1',
  pickup_status: 'assigned',
  kind: 'airport',
  pickup_at: '2026-11-20T13:30:00Z',
  previous_pickup_at: null,
  changed_at: null,
  pickup_location: 'LOS arrivals',
  dropoff_location: 'Grand Hotel',
  passenger_count: 4,
  flight_number: 'EK783',
  flight_phase: 'in_air',
  delay_minutes: 45,
  principal: { title: 'Bishop', full_name: 'Augustine Okafor', category: 'Cat. 1' },
  passengers: [],
  ...overrides,
})

describe('splitDay', () => {
  it('puts the trip under way first, then the next one, and sorts the rest', () => {
    const first = trip({ assignment_id: 'first', pickup_at: '2026-11-20T10:00:00Z' })
    const started = trip({ assignment_id: 'started', en_route_at: '2026-11-20T11:00:00Z' })
    const moved = trip({ assignment_id: 'moved', status: 'released' })
    const done = trip({ assignment_id: 'done', status: 'completed', pickup_status: 'completed' })

    const day = splitDay([first, started, moved, done])

    expect(day.hero?.assignment_id).toBe('started')
    expect(day.later.map((item) => item.assignment_id)).toEqual(['first'])
    expect(day.moved.map((item) => item.assignment_id)).toEqual(['moved'])
    expect(day.done.map((item) => item.assignment_id)).toEqual(['done'])
    expect(splitDay([]).hero).toBeNull()
  })
})

describe('trip steps and wording', () => {
  it('walks the one button through start, picked up and dropped off', () => {
    expect(nextStep(trip())).toEqual({ status: 'en_route', label: 'Start pickup' })
    expect(nextStep(trip({ en_route_at: 'x' }))).toEqual({ status: 'picked_up', label: 'Picked up' })
    expect(nextStep(trip({ en_route_at: 'x', picked_up_at: 'y' }))).toEqual({ status: 'completed', label: 'Dropped off' })
    expect(progressLabel(trip())).toBeNull()
    expect(progressLabel(trip({ en_route_at: 'x' }))).toBe('On the way')
  })

  it('asks the driver to confirm a moved or new trip', () => {
    expect(changeNotice(trip({ acknowledged_at: null, previous_pickup_at: '2026-11-20T13:10:00Z' }), 'Africa/Lagos')).toBe('Time changed from 14:10.')
    expect(changeNotice(trip({ acknowledged_at: null }), 'Africa/Lagos')).toBe('New pickup for you.')
    expect(changeNotice(trip(), 'Africa/Lagos')).toBeNull()
  })

  it('shows the flight and the party', () => {
    expect(flightStatus(trip())).toEqual({ label: 'Delayed +45 min', landed: false })
    expect(flightStatus(trip({ flight_phase: 'landed' }))).toEqual({ label: 'Landed', landed: true })
    expect(flightStatus(trip({ flight_number: null }))).toBeNull()
    expect(partyLabel(trip())).toBe('Bishop Augustine Okafor +3')
  })
})
