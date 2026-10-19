// Room types and rooms (FR-PL-04). Unknown keys are rejected (strict objects), so a client can
// never set columns such as event_id or housekeeping_status through these endpoints.
import { z } from 'zod'
import {
  AT_LEAST_ONE_FIELD,
  blankToUndefined,
  hasAtLeastOneField,
  intInRange,
  optionalText,
  requiredText,
  uuidSchema,
} from './common'

export const ROOM_LIMITS = {
  floor: { min: -5, max: 200 },
  position: { min: 0, max: 10_000 },
  capacity: { min: 1, max: 20 },
  tier: { min: 1, max: 99 },
  cleaningMinutes: { min: 5, max: 600 },
} as const

export const roomNumberSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,19}$/, 'Use up to 20 letters, digits, spaces, dots, dashes or underscores')

export const wingSchema = requiredText(50)
export const roomTypeNameSchema = requiredText(100)

export const roomTypeCreateSchema = z.strictObject({
  name: roomTypeNameSchema,
  tier: intInRange(ROOM_LIMITS.tier.min, ROOM_LIMITS.tier.max),
  default_capacity: intInRange(ROOM_LIMITS.capacity.min, ROOM_LIMITS.capacity.max),
  cleaning_minutes: intInRange(ROOM_LIMITS.cleaningMinutes.min, ROOM_LIMITS.cleaningMinutes.max),
})

export const roomTypeUpdateSchema = roomTypeCreateSchema.partial().refine(hasAtLeastOneField, AT_LEAST_ONE_FIELD)

export const roomCreateSchema = z.strictObject({
  number: roomNumberSchema,
  floor: intInRange(ROOM_LIMITS.floor.min, ROOM_LIMITS.floor.max),
  wing: wingSchema,
  position: intInRange(ROOM_LIMITS.position.min, ROOM_LIMITS.position.max).optional(),
  room_type_id: uuidSchema,
  /** Omit to use the room type's default capacity. */
  capacity: intInRange(ROOM_LIMITS.capacity.min, ROOM_LIMITS.capacity.max).optional(),
  is_accessible: z.boolean().optional(),
  out_of_service: z.boolean().optional(),
  notes: optionalText(2000),
})

export const roomUpdateSchema = roomCreateSchema.partial().refine(hasAtLeastOneField, AT_LEAST_ONE_FIELD)

export const roomListQuerySchema = z.object({
  // "?floor=" (blank) means no filter, not floor 0.
  floor: z.preprocess(blankToUndefined, z.coerce.number().int().optional()),
  wing: z.string().trim().min(1).max(50).optional(),
  room_type_id: uuidSchema.optional(),
})

export type RoomTypeCreate = z.infer<typeof roomTypeCreateSchema>
export type RoomTypeUpdate = z.infer<typeof roomTypeUpdateSchema>
export type RoomCreate = z.infer<typeof roomCreateSchema>
export type RoomUpdate = z.infer<typeof roomUpdateSchema>
