// VIP categories (FR-PL-06): coordinators and above edit; the programs team reads.
import 'server-only'
import { createCrudRoutes } from '@/lib/api/crud-routes'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { createCrudRepository } from '@/lib/repositories/crud'
import { vipCategoryCreateSchema, vipCategoryListQuerySchema, vipCategoryUpdateSchema } from '@/lib/validation/vip-categories'

export const vipCategoryRoutes = createCrudRoutes({
  entityName: 'VIP category',
  repository: createCrudRepository('vip_categories', [{ column: 'rank', direction: 'asc' }]),
  readRoles: [...COORDINATOR_PLUS, 'programs'],
  writeRoles: COORDINATOR_PLUS,
  createSchema: vipCategoryCreateSchema,
  updateSchema: vipCategoryUpdateSchema,
  listQuerySchema: vipCategoryListQuerySchema,
})
