import { describe, expect, expectTypeOf, it } from 'vitest'
import type { AppRole as DbAppRole } from '@/lib/db/types'
import {
  ADMIN_PLUS,
  APP_ROLES,
  type AppRole,
  COORDINATOR_PLUS,
  HOME_ROUTES,
  canManageAccount,
  hasAnyRole,
  isAppRole,
} from './roles'

describe('roles', () => {
  it('matches the database enum exactly', () => {
    expectTypeOf<AppRole>().toEqualTypeOf<DbAppRole>()
    expect(APP_ROLES).toHaveLength(8)
  })

  it('recognises valid role strings only', () => {
    expect(isAppRole('coordinator')).toBe(true)
    expect(isAppRole('user')).toBe(false)
    expect(isAppRole(undefined)).toBe(false)
  })

  it('treats admins as coordinators but not the other way round', () => {
    expect(hasAnyRole('admin', COORDINATOR_PLUS)).toBe(true)
    expect(hasAnyRole('coordinator', ADMIN_PLUS)).toBe(false)
    expect(hasAnyRole('driver', COORDINATOR_PLUS)).toBe(false)
  })

  it('lets a super admin manage every account', () => {
    for (const target of APP_ROLES) {
      expect(canManageAccount('super_admin', target)).toBe(true)
    }
  })

  it('lets an admin manage only accounts below admin', () => {
    expect(canManageAccount('admin', 'coordinator')).toBe(true)
    expect(canManageAccount('admin', 'driver')).toBe(true)
    expect(canManageAccount('admin', 'admin')).toBe(false)
    expect(canManageAccount('admin', 'super_admin')).toBe(false)
  })

  it('ranks a Programme Manager above Admin: admin-level access, managing Admins and below', () => {
    expect(hasAnyRole('programme_manager', ADMIN_PLUS)).toBe(true)
    expect(hasAnyRole('programme_manager', COORDINATOR_PLUS)).toBe(true)
    expect(canManageAccount('programme_manager', 'admin')).toBe(true)
    expect(canManageAccount('programme_manager', 'driver')).toBe(true)
    expect(canManageAccount('programme_manager', 'programme_manager')).toBe(false)
    expect(canManageAccount('programme_manager', 'super_admin')).toBe(false)
    expect(canManageAccount('admin', 'programme_manager')).toBe(false)
    expect(HOME_ROUTES.programme_manager).toBe('/dashboard')
  })

  it('does not let other roles manage accounts', () => {
    expect(canManageAccount('coordinator', 'driver')).toBe(false)
    expect(canManageAccount('housekeeping', 'housekeeping')).toBe(false)
  })

  it('sends every role to its own home screen', () => {
    expect(HOME_ROUTES.coordinator).toBe('/dashboard')
    expect(HOME_ROUTES.programs).toBe('/programme')
    expect(HOME_ROUTES.driver).toBe('/driver')
    expect(HOME_ROUTES.accommodation).toBe('/staff/front-desk')
    expect(HOME_ROUTES.housekeeping).toBe('/staff/sanitation')
  })
})
