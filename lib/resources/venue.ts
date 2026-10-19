// Room types and rooms (FR-PL-04): Admin edits; coordinators, accommodation and housekeeping read.
import 'server-only'
import { createCrudRoutes } from '@/lib/api/crud-routes'
import { ADMIN_PLUS } from '@/lib/auth/roles'
import { type Filter, createCrudRepository } from '@/lib/repositories/crud'
import { paginationSchema } from '@/lib/validation/common'
import {
  roomCreateSchema,
  roomListQuerySchema,
  roomTypeCreateSchema,
  roomTypeUpdateSchema,
  roomUpdateSchema,
} from '@/lib/validation/venue'

export const VENUE_READ_ROLES = ['super_admin', 'admin', 'coordinator', 'accommodation', 'housekeeping'] as const

export const roomTypeRepository = createCrudRepository('room_types', [
  { column: 'tier', direction: 'asc' },
  { column: 'name', direction: 'asc' },
])

export const roomRepository = createCrudRepository('rooms', [
  { column: 'floor', direction: 'asc' },
  { column: 'wing', direction: 'asc' },
  { column: 'position', direction: 'asc' },
  { column: 'number', direction: 'asc' },
])

export const roomTypeRoutes = createCrudRoutes({
  entityName: 'Room type',
  repository: roomTypeRepository,
  readRoles: VENUE_READ_ROLES,
  writeRoles: ADMIN_PLUS,
  createSchema: roomTypeCreateSchema,
  updateSchema: roomTypeUpdateSchema,
  listQuerySchema: paginationSchema,
})

const roomListSchema = paginationSchema.extend(roomListQuerySchema.shape)

export const roomRoutes = createCrudRoutes({
  entityName: 'Room',
  repository: roomRepository,
  readRoles: VENUE_READ_ROLES,
  writeRoles: ADMIN_PLUS,
  createSchema: roomCreateSchema,
  updateSchema: roomUpdateSchema,
  listQuerySchema: roomListSchema,
  toFilters: (query) => {
    const filters: Filter[] = []
    if (query.floor !== undefined) filters.push({ column: 'floor', operator: '=', value: query.floor })
    if (query.wing !== undefined) filters.push({ column: 'wing', operator: '=', value: query.wing })
    if (query.room_type_id !== undefined) filters.push({ column: 'room_type_id', operator: '=', value: query.room_type_id })
    return filters
  },
})
