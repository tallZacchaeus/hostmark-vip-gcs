// Request shapes for room allocation and the front desk (P4).
import { z } from 'zod'
import { optionalText, uuidSchema } from './common'

export const moveCheckSchema = z.object({ guest_id: uuidSchema, room_id: uuidSchema })

const WARNING_CODE = z.string().regex(/^[a-z_]{1,40}$/)

/** The shortest reason accepted for "assign anyway" (the same limit as public.assign_room). */
export const MIN_OVERRIDE_REASON = 10

/**
 * A manual assignment. When the move breaks a rule or loses a preference, `reason` (at least 10
 * characters) and `acknowledged` (the code of every warning the dialog showed) are required.
 */
export const assignRoomSchema = z.object({
  guest_id: uuidSchema,
  room_id: uuidSchema,
  reason: optionalText(1000),
  acknowledged: z.array(WARNING_CODE).max(10).default([]),
})
