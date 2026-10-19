import { describe, expect, it } from 'vitest'
import { PAGE_ACCESS, PAGE_KEYS, PAGE_PATHS, canOpenPage, settingsTabsFor } from './page-access'
import { APP_ROLES, HOME_ROUTES } from './roles'

describe('page access', () => {
  it('lets coordinators and admins open the console screens', () => {
    for (const role of ['coordinator', 'admin', 'super_admin'] as const) {
      expect(canOpenPage(role, 'dashboard')).toBe(true)
      expect(canOpenPage(role, 'rooms')).toBe(true)
      expect(canOpenPage(role, 'activity')).toBe(true)
    }
  })

  it('keeps staff roles out of the coordinator console', () => {
    for (const role of ['driver', 'accommodation', 'housekeeping', 'programs'] as const) {
      expect(canOpenPage(role, 'dashboard')).toBe(false)
      expect(canOpenPage(role, 'guests')).toBe(false)
    }
  })

  it('gives each staff role its own screen only', () => {
    expect(canOpenPage('driver', 'driver')).toBe(true)
    expect(canOpenPage('driver', 'staffSanitation')).toBe(false)
    expect(canOpenPage('housekeeping', 'staffSanitation')).toBe(true)
    expect(canOpenPage('housekeeping', 'frontDesk')).toBe(false)
    expect(canOpenPage('accommodation', 'frontDesk')).toBe(true)
    expect(canOpenPage('coordinator', 'frontDesk')).toBe(true)
    expect(canOpenPage('programs', 'programme')).toBe(true)
  })

  it('lets every role open its own home screen', () => {
    for (const role of APP_ROLES) {
      const home = PAGE_KEYS.find((page) => PAGE_PATHS[page] === HOME_ROUTES[role])
      expect(home, `home of ${role}`).toBeDefined()
      expect(PAGE_ACCESS[home as (typeof PAGE_KEYS)[number]]).toContain(role)
    }
  })

  it('shows coordinators only the VIP categories settings tab', () => {
    expect(settingsTabsFor('coordinator')).toEqual(['categories'])
    expect(settingsTabsFor('admin')).toEqual(['users', 'rooms', 'drivers', 'categories', 'system'])
    expect(settingsTabsFor('driver')).toEqual([])
  })
})
