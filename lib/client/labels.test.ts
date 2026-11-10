import { describe, expect, it } from 'vitest'
import { ASSIGNABLE_ROLES, ROLE_LABELS, entityHref } from './labels'

describe('entityHref', () => {
  it('links console users to the screen for each kind of record', () => {
    expect(entityHref('coordinator', 'proposals', 'p-1')).toBe('/dashboard#approvals')
    expect(entityHref('coordinator', 'intake_submissions', 's-1')).toBe('/intake/s-1')
    expect(entityHref('coordinator', 'intake_submissions', null)).toBe('/intake')
    expect(entityHref('coordinator', 'guests', 'g-1')).toBe('/guests/g-1')
    expect(entityHref('admin', 'delegations', null)).toBe('/guests')
    expect(entityHref('coordinator', 'flights', 'f-1')).toBe('/arrivals')
    expect(entityHref('coordinator', 'arrivals', 'a-1')).toBe('/arrivals')
    expect(entityHref('coordinator', 'pickups', 'p-1')).toBe('/transport')
    expect(entityHref('coordinator', 'pickup_assignments', 'p-1')).toBe('/transport')
    expect(entityHref('coordinator', 'rooms', 'r-1')).toBe('/rooms')
    expect(entityHref('coordinator', 'room_assignments', 'r-1')).toBe('/rooms')
    expect(entityHref('coordinator', 'cleaning_tasks', 't-1')).toBe('/sanitation')
    expect(entityHref('programs', 'program_items', 'i-1')).toBe('/programme')
  })

  it('keeps staff inside their own app', () => {
    expect(entityHref('driver', 'pickups', 'p-1')).toBe('/driver')
    expect(entityHref('driver', 'pickup_assignments', 'p-1')).toBe('/driver')
    expect(entityHref('housekeeping', 'cleaning_tasks', 't-1')).toBe('/staff/sanitation')
    expect(entityHref('housekeeping', 'rooms', 'r-1')).toBe('/staff/sanitation')
    expect(entityHref('accommodation', 'room_assignments', 'r-1')).toBe('/staff/front-desk')
    expect(entityHref('accommodation', 'guests', 'g-1')).toBe('/staff/front-desk')
    expect(entityHref('accommodation', 'rooms', 'r-1')).toBe('/staff/front-desk')
  })

  it('has no link for unknown or missing record types', () => {
    expect(entityHref('coordinator', null, null)).toBeNull()
    expect(entityHref('coordinator', 'audit_log', 'x')).toBeNull()
  })
})

describe('entityHref for roles with a narrow app', () => {
  it('never links a role to a page it cannot open', () => {
    expect(entityHref('driver', 'program_items', 'i-1')).toBeNull()
    expect(entityHref('driver', 'guests', 'g-1')).toBeNull()
    expect(entityHref('driver', 'proposals', 'p-1')).toBeNull()
    expect(entityHref('housekeeping', 'flights', 'f-1')).toBeNull()
    expect(entityHref('accommodation', 'pickups', 'p-1')).toBeNull()
    expect(entityHref('programs', 'guests', 'g-1')).toBeNull()
    expect(entityHref('programs', 'intake_submissions', 's-1')).toBeNull()
  })

  it('keeps the links each role can open', () => {
    expect(entityHref('programs', 'program_items', 'i-1')).toBe('/programme')
    expect(entityHref('accommodation', 'cleaning_tasks', 't-1')).toBeNull()
    expect(entityHref('coordinator', 'cleaning_tasks', 't-1')).toBe('/sanitation')
    expect(entityHref('admin', 'proposals', 'p-1')).toBe('/dashboard#approvals')
  })
})

describe('role labels', () => {
  it('names every assignable role', () => {
    expect(ASSIGNABLE_ROLES.map((role) => ROLE_LABELS[role])).toEqual([
      'Event Coordinator',
      'Admin',
      'Programme Manager',
      'Programmes team',
      'Driver',
      'Front desk',
      'Housekeeping',
      'Super Admin',
    ])
  })
})
