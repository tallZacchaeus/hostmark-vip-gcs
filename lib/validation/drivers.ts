// Drivers, vehicles and shifts (FR-PL-05).
import { z } from 'zod'
import {
  AT_LEAST_ONE_FIELD,
  booleanQuery,
  e164PhoneSchema,
  hasAtLeastOneField,
  intInRange,
  optionalText,
  paginationSchema,
  requiredText,
  uuidSchema,
} from './common'

const MAX_SHIFT_HOURS = 24
const HOUR_MS = 60 * 60 * 1000
const timestamp = z.iso.datetime({ offset: true, message: 'Use an ISO 8601 date-time with a time zone' })

export const driverCreateSchema = z.strictObject({
  full_name: requiredText(200),
  phone: e164PhoneSchema.optional(),
  vehicle_label: optionalText(100),
  vehicle_capacity: intInRange(1, 60),
  is_active: z.boolean().optional(),
  /** Login for the driver app; the account must have the Driver role. */
  profile_id: uuidSchema.nullable().optional(),
})

export const driverUpdateSchema = driverCreateSchema
  .extend({ phone: e164PhoneSchema.nullable().optional() })
  .partial()
  .refine(hasAtLeastOneField, AT_LEAST_ONE_FIELD)

export const driverListQuerySchema = paginationSchema.extend({
  active: booleanQuery.optional(),
})

function shiftIsValid(value: { starts_at?: string; ends_at?: string }): boolean {
  if (!value.starts_at || !value.ends_at) {
    return true
  }
  const duration = Date.parse(value.ends_at) - Date.parse(value.starts_at)
  return duration > 0 && duration <= MAX_SHIFT_HOURS * HOUR_MS
}
const SHIFT_RULE = { message: `A shift must end after it starts and last at most ${MAX_SHIFT_HOURS} hours`, path: ['ends_at'] }

export const shiftCreateSchema = z
  .strictObject({ driver_id: uuidSchema, starts_at: timestamp, ends_at: timestamp })
  .refine(shiftIsValid, SHIFT_RULE)

export const shiftUpdateSchema = z
  .strictObject({ starts_at: timestamp.optional(), ends_at: timestamp.optional() })
  .refine(hasAtLeastOneField, AT_LEAST_ONE_FIELD)
  .refine(shiftIsValid, SHIFT_RULE)

export const shiftListQuerySchema = paginationSchema.extend({
  driver_id: uuidSchema.optional(),
  from: timestamp.optional(),
  to: timestamp.optional(),
})
