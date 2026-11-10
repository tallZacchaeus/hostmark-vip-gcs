import { describe, expect, it } from 'vitest'
import { type ArrivalBoardRow, filterRows, flightBadge, groupByHour, needsDriver, pickupBadge, previousTime, suggestionLabel } from './model'

type Flight = NonNullable<ArrivalBoardRow['flight']>

const flight = (overrides: Partial<Flight> = {}): Flight => ({
  id: 'f-1',
  flight_number: 'EK783',
  phase: 'scheduled',
  delay_minutes: null,
  scheduled_arrival_at: '2026-10-28T13:25:00.000Z',
  manual_arrival_at: null,
  ...overrides,
})

const row = (overrides: Partial<ArrivalBoardRow> = {}): ArrivalBoardRow => ({
  arrival_id: 'a-1',
  delegation_id: 'd-1',
  delegation_name: 'Okafor delegation',
  principal_guest_id: 'g-1',
  principal_name: 'Bishop Augustine Okafor',
  category: 'Cat. 1',
  party_size: 4,
  mode: 'flying',
  pickup_address: null,
  arrival_at: '2026-10-28T13:25:00.000Z',
  attention: null,
  status: 'due',
  flight: flight(),
  pickup: null,
  drivers: [],
  suggestion: null,
  ...overrides,
})

const pickup = (status: string): NonNullable<ArrivalBoardRow['pickup']> => ({
  id: 'p-1',
  status,
  pickup_at: '2026-10-28T13:55:00.000Z',
  previous_pickup_at: null,
  pickup_location: 'LOS arrivals',
})

describe('flightBadge', () => {
  it('has no badge without a flight', () => {
    expect(flightBadge(row({ flight: null }))).toBeNull()
  })

  it('calls out flights that will not arrive as planned', () => {
    expect(flightBadge(row({ flight: flight({ phase: 'cancelled' }) }))).toEqual({ label: 'Cancelled', tone: 'error' })
    expect(flightBadge(row({ flight: flight({ phase: 'diverted' }) }))).toEqual({ label: 'Diverted', tone: 'error' })
  })

  it('marks landed flights and hand-set times', () => {
    expect(flightBadge(row({ flight: flight({ phase: 'landed' }) }))).toEqual({ label: 'Landed', tone: 'success' })
    expect(flightBadge(row({ flight: flight({ manual_arrival_at: '2026-10-28T14:00:00.000Z' }) }))).toEqual({ label: 'Time set by hand', tone: 'info' })
  })

  it('shows how late or early a flight is', () => {
    expect(flightBadge(row({ status: 'delayed', flight: flight({ delay_minutes: 45 }) }))).toEqual({ label: 'Delayed +45 min', tone: 'warning' })
    expect(flightBadge(row({ status: 'delayed', flight: flight({ delay_minutes: null }) }))).toEqual({ label: 'Delayed +0 min', tone: 'warning' })
    expect(flightBadge(row({ flight: flight({ delay_minutes: -15 }) }))).toEqual({ label: 'Early 15 min', tone: 'info' })
  })

  it('is "In the air" or "On time" otherwise', () => {
    expect(flightBadge(row({ flight: flight({ phase: 'in_air', delay_minutes: 0 }) }))).toEqual({ label: 'In the air', tone: 'info' })
    expect(flightBadge(row({ flight: flight({ delay_minutes: 0 }) }))).toEqual({ label: 'On time', tone: 'neutral' })
  })
})

describe('pickupBadge', () => {
  it('reads the pickup status, keeping unknown statuses as they are', () => {
    expect(pickupBadge(row({ pickup: pickup('assigned') }))).toEqual({ label: 'Driver assigned', tone: 'success' })
    expect(pickupBadge(row({ pickup: pickup('on_hold') }))).toEqual({ label: 'on_hold', tone: 'neutral' })
  })

  it('explains a missing pickup by how the party travels', () => {
    expect(pickupBadge(row({ mode: 'own_transport' }))).toEqual({ label: 'Pickup not needed', tone: 'neutral' })
    expect(pickupBadge(row({ mode: 'flying' }))).toEqual({ label: 'Waits for landing time', tone: 'neutral' })
    expect(pickupBadge(row({ mode: 'pickup' }))).toEqual({ label: 'Not planned', tone: 'neutral' })
  })
})

describe('suggestionLabel and needsDriver', () => {
  it('names the suggested driver, a release, or a generic suggestion', () => {
    expect(suggestionLabel(row())).toBeNull()
    expect(suggestionLabel(row({ suggestion: { proposal_id: 'p', kind: 'release_pickup', driver_names: null } }))).toBe('Release suggested')
    expect(suggestionLabel(row({ suggestion: { proposal_id: 'p', kind: 'driver_assignment', driver_names: 'Sule Abdullahi' } }))).toBe('Sule Abdullahi')
    expect(suggestionLabel(row({ suggestion: { proposal_id: 'p', kind: 'driver_assignment', driver_names: null } }))).toBe('Driver suggested')
  })

  it('flags a pickup with no driver and no suggestion', () => {
    expect(needsDriver(row({ pickup: pickup('pending_assignment') }))).toBe(true)
    expect(needsDriver(row({ pickup: pickup('pending_assignment'), drivers: ['Musa Bello'] }))).toBe(false)
    expect(needsDriver(row({ pickup: pickup('pending_assignment'), suggestion: { proposal_id: 'p', kind: 'driver_assignment', driver_names: null } }))).toBe(false)
    expect(needsDriver(row({ pickup: pickup('assigned') }))).toBe(false)
    expect(needsDriver(row())).toBe(false)
  })
})

describe('previousTime', () => {
  it('shows the scheduled time only when the landing time moved', () => {
    expect(previousTime(row({ arrival_at: '2026-10-28T14:10:00.000Z' }), 'Africa/Lagos')).toBe('14:25')
    expect(previousTime(row(), 'Africa/Lagos')).toBeNull()
    expect(previousTime(row({ arrival_at: null }), 'Africa/Lagos')).toBeNull()
    expect(previousTime(row({ flight: null }), 'Africa/Lagos')).toBeNull()
  })
})

describe('filterRows', () => {
  const now = new Date('2026-10-28T12:00:00.000Z')
  const soon = row({ arrival_id: 'soon', arrival_at: '2026-10-28T13:00:00.000Z', status: 'delayed' })
  const later = row({ arrival_id: 'later', arrival_at: '2026-10-28T16:30:00.000Z', delegation_name: 'Eze party', principal_name: null, flight: flight({ flight_number: 'AW312' }) })
  const past = row({ arrival_id: 'past', arrival_at: '2026-10-28T10:30:00.000Z' })
  const untimed = row({ arrival_id: 'untimed', arrival_at: null, flight: null })
  const rows = [soon, later, past, untimed]
  const ids = (result: ArrivalBoardRow[]) => result.map((item) => item.arrival_id)

  it('keeps the whole day, or any day other than today', () => {
    expect(ids(filterRows(rows, { status: 'all', query: '', window: 'day', isToday: true }, now))).toEqual(['soon', 'later', 'past', 'untimed'])
    expect(ids(filterRows(rows, { status: 'all', query: '', window: '2h', isToday: false }, now))).toEqual(['soon', 'later', 'past', 'untimed'])
  })

  it('limits today to a window from an hour ago, dropping arrivals without a time', () => {
    expect(ids(filterRows(rows, { status: 'all', query: '', window: '2h', isToday: true }, now))).toEqual(['soon'])
    expect(ids(filterRows(rows, { status: 'all', query: '', window: '6h', isToday: true }, now))).toEqual(['soon', 'later'])
  })

  it('filters by status and searches names and flight numbers', () => {
    expect(ids(filterRows(rows, { status: 'delayed', query: '', window: 'day', isToday: true }, now))).toEqual(['soon'])
    expect(ids(filterRows(rows, { status: 'all', query: ' aw312 ', window: 'day', isToday: true }, now))).toEqual(['later'])
    expect(ids(filterRows(rows, { status: 'all', query: 'eze', window: 'day', isToday: true }, now))).toEqual(['later'])
    expect(ids(filterRows([untimed], { status: 'all', query: 'okafor', window: 'day', isToday: true }, now))).toEqual(['untimed'])
  })
})

describe('groupByHour', () => {
  it('groups consecutive arrivals by local hour and puts untimed ones last', () => {
    const groups = groupByHour(
      [
        row({ arrival_id: 'a', arrival_at: '2026-10-28T13:05:00.000Z' }),
        row({ arrival_id: 'b', arrival_at: '2026-10-28T13:40:00.000Z' }),
        row({ arrival_id: 'c', arrival_at: '2026-10-28T15:10:00.000Z' }),
        row({ arrival_id: 'd', arrival_at: null }),
      ],
      'Africa/Lagos',
    )
    expect(groups.map((group) => [group.hour, group.rows.map((item) => item.arrival_id)])).toEqual([
      ['14:00', ['a', 'b']],
      ['16:00', ['c']],
      ['Time to follow', ['d']],
    ])
    expect(groups[0]?.starts_at).toBe(Date.parse('2026-10-28T13:00:00.000Z'))
    expect(groups[2]?.starts_at).toBe(Number.POSITIVE_INFINITY)
  })
})
