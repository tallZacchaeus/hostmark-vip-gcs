// Drivers and shifts (FR-PL-05): Admin edits; coordinators read; a driver sees only their own
// record (row-level security), which also makes these routes safe for the driver app.
import 'server-only'
import { createCrudRoutes } from '@/lib/api/crud-routes'
import { ADMIN_PLUS } from '@/lib/auth/roles'
import { type Filter, createCrudRepository } from '@/lib/repositories/crud'
import {
  driverCreateSchema,
  driverListQuerySchema,
  driverUpdateSchema,
  shiftCreateSchema,
  shiftListQuerySchema,
  shiftUpdateSchema,
} from '@/lib/validation/drivers'

const DRIVER_READ_ROLES = ['super_admin', 'admin', 'coordinator', 'driver'] as const

export const driverRoutes = createCrudRoutes({
  entityName: 'Driver',
  repository: createCrudRepository('drivers', [{ column: 'full_name', direction: 'asc' }]),
  readRoles: DRIVER_READ_ROLES,
  writeRoles: ADMIN_PLUS,
  createSchema: driverCreateSchema,
  updateSchema: driverUpdateSchema,
  listQuerySchema: driverListQuerySchema,
  toFilters: (query) => (query.active === undefined ? [] : [{ column: 'is_active', operator: '=', value: query.active }]),
})

export const driverShiftRoutes = createCrudRoutes({
  entityName: 'Shift',
  repository: createCrudRepository('driver_shifts', [{ column: 'starts_at', direction: 'asc' }]),
  readRoles: DRIVER_READ_ROLES,
  writeRoles: ADMIN_PLUS,
  createSchema: shiftCreateSchema,
  updateSchema: shiftUpdateSchema,
  listQuerySchema: shiftListQuerySchema,
  toFilters: (query) => {
    const filters: Filter[] = []
    if (query.driver_id) filters.push({ column: 'driver_id', operator: '=', value: query.driver_id })
    // Shifts that overlap [from, to).
    if (query.to) filters.push({ column: 'starts_at', operator: '<', value: query.to })
    if (query.from) filters.push({ column: 'ends_at', operator: '>', value: query.from })
    return filters
  },
})
