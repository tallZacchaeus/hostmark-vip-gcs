// VIP category rank list (FR-PL-06). Rank 1 is the highest.
import { z } from 'zod'
import { AT_LEAST_ONE_FIELD, hasAtLeastOneField, intInRange, paginationSchema, requiredText, uuidSchema } from './common'

const MAX_CATEGORIES = 99

export const vipCategoryCreateSchema = z.strictObject({
  name: requiredText(100),
  rank: intInRange(1, MAX_CATEGORIES),
  preferred_room_tier: intInRange(1, 99).nullable().optional(),
})

export const vipCategoryUpdateSchema = vipCategoryCreateSchema.partial().refine(hasAtLeastOneField, AT_LEAST_ONE_FIELD)

export const vipCategoryListQuerySchema = paginationSchema

export const vipCategoryReorderSchema = z.strictObject({
  ids: z.array(uuidSchema).min(1).max(MAX_CATEGORIES),
})
