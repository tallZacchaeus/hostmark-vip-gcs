import { describe, expect, it } from 'vitest'
import { actorLabel, changesOf, domainOf, fieldLabel, formatValue, objectOf, tablesForDomain, verbOf } from './activity-format'

const asIs = (iso: string) => `T(${iso.slice(11, 16)})`

describe('activity sentences', () => {
  it('names who acted', () => {
    expect(actorLabel({ actor_type: 'user', actor_name: 'Tolu Adebayo' })).toBe('Tolu Adebayo')
    expect(actorLabel({ actor_type: 'user', actor_name: null })).toBe('A staff member')
    expect(actorLabel({ actor_type: 'system', actor_name: null })).toBe('The system')
    expect(actorLabel({ actor_type: 'copilot', actor_name: null })).toBe('Victoria')
    expect(actorLabel({ actor_type: 'guest_intake', actor_name: null })).toBe('Guest registration')
  })

  it('describes the operation', () => {
    expect(verbOf('rooms.insert')).toBe('added')
    expect(verbOf('rooms.update')).toBe('updated')
    expect(verbOf('rooms.delete')).toBe('removed')
    expect(verbOf('rooms.undo')).toBe('undid a change to')
    expect(verbOf('profiles.password_reset')).toBe('reset the password for the')
    expect(verbOf('pickups.start_trip')).toBe('start trip')
  })

  it('names the object from the row image and links to its screen', () => {
    expect(objectOf({ entity_type: 'rooms', before: null, after: { number: '412' } })).toEqual({ label: 'room 412', href: '/rooms' })
    expect(objectOf({ entity_type: 'proposals', before: null, after: { title: 'Assign Kunle' } }).label).toBe('“Assign Kunle”')
    expect(objectOf({ entity_type: 'driver_shifts', before: { id: 'x' }, after: null }).label).toBe('driver shift')
    expect(objectOf({ entity_type: 'mystery_items', before: null, after: null })).toEqual({ label: 'mystery item', href: undefined })
  })

  it('groups tables into the Type filter domains', () => {
    expect(domainOf('rooms')).toBe('Rooms')
    expect(domainOf('drivers')).toBe('Transport')
    expect(domainOf('unknown')).toBe('Setup')
    expect(tablesForDomain('Rooms')).toEqual(['rooms', 'room_types', 'room_assignments'])
    expect(tablesForDomain('Sanitation')).toEqual(['cleaning_tasks'])
    expect(verbOf('rooms.check_out')).toBe('checked out the')
  })
})

describe('activity changes', () => {
  it('lists changed fields only, ignoring bookkeeping columns', () => {
    const changes = changesOf(
      {
        before: { id: '1', number: '412', out_of_service: false, updated_at: 'a', notes: null },
        after: { id: '1', number: '412', out_of_service: true, updated_at: 'b', notes: 'Leak' },
      },
      asIs,
    )
    expect(changes).toEqual([
      { label: 'Out of service', oldValue: 'No', newValue: 'Yes' },
      { label: 'Notes', oldValue: '—', newValue: 'Leak' },
    ])
  })

  it('shows inserts and deletes against an empty side', () => {
    expect(changesOf({ before: null, after: { name: 'Suite' } }, asIs)).toEqual([{ label: 'Name', oldValue: '—', newValue: 'Suite' }])
    expect(changesOf({ before: { name: 'Suite' }, after: null }, asIs)).toEqual([{ label: 'Name', oldValue: 'Suite', newValue: '—' }])
  })

  it('formats values for people', () => {
    expect(formatValue('2026-10-28T10:20:00Z', asIs)).toBe('T(10:20)')
    expect(formatValue(['LOS', 'ABV'], asIs)).toBe('LOS, ABV')
    expect(formatValue([], asIs)).toBe('—')
    expect(formatValue({ a: 1 }, asIs)).toBe('{"a":1}')
    expect(formatValue(3, asIs)).toBe('3')
    expect(fieldLabel('room_type_id')).toBe('Room type')
  })
})
