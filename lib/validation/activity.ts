// Audit log, notifications and the decisions queue (FR-PL-07, FR-PL-08, FR-PL-09).
import { z } from 'zod'
import { booleanQuery, optionalText, paginationSchema, uuidSchema } from './common'

const timestamp = z.iso.datetime({ offset: true, message: 'Use an ISO 8601 date-time with a time zone' })

const tableName = z.string().regex(/^[a-z_]{1,50}$/, 'Use a table name such as rooms')
const MAX_ENTITY_TYPES = 20

export const auditListQuerySchema = paginationSchema.extend({
  entity_type: tableName.optional(),
  /** Several tables at once, comma-separated: "pickups,pickup_assignments". */
  entity_types: z
    .string()
    .transform((value) => value.split(',').map((entry) => entry.trim()).filter((entry) => entry !== ''))
    .pipe(z.array(tableName).min(1).max(MAX_ENTITY_TYPES))
    .optional(),
  actor_type: z.enum(['user', 'system', 'copilot', 'guest_intake']).optional(),
  entity_id: uuidSchema.optional(),
  actor_id: uuidSchema.optional(),
  automatic: booleanQuery.optional(),
  from: timestamp.optional(),
  to: timestamp.optional(),
})

/** audit_log ids are bigints, sent as digit strings. */
export const auditIdParamsSchema = z.object({
  id: z.string().regex(/^[1-9][0-9]{0,17}$/, 'Must be a numeric id'),
})

export const undoBodySchema = z.strictObject({ reason: optionalText(500) })

export const notificationListQuerySchema = paginationSchema.extend({
  unread_only: booleanQuery.optional(),
})

const MAX_IDS_PER_REQUEST = 200

export const markReadBodySchema = z.strictObject({
  /** Omit to mark every unread notification as read. */
  ids: z.array(uuidSchema).min(1).max(MAX_IDS_PER_REQUEST).optional(),
})

export const decisionsQuerySchema = paginationSchema

export const approveBodySchema = z.strictObject({
  /** For room plans: approve only these lines. Omit to approve the whole proposal. */
  line_ids: z.array(uuidSchema).min(1).max(500).optional(),
})

export const rejectBodySchema = z.strictObject({ note: optionalText(2000) })
