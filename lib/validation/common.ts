// Shared Zod building blocks. Limits mirror the CHECK constraints in db/migrations, so most
// bad input is rejected here with a clear message before it reaches the database.
import { z } from 'zod'

export const uuidSchema = z.uuid('Must be a valid id')

export const idParamsSchema = z.object({ id: uuidSchema })

export const e164PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9][0-9]{6,14}$/, 'Use international format, for example +2348012345678')

export function requiredText(max: number): z.ZodString {
  return z.string().trim().min(1, 'Required').max(max, `At most ${max} characters`)
}

/** Optional free text: blank becomes null. */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `At most ${max} characters`)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional()
}

export function intInRange(min: number, max: number): z.ZodNumber {
  return z.number().int('Must be a whole number').min(min, `At least ${min}`).max(max, `At most ${max}`)
}

/** Treats empty strings as "not provided" (CSV cells, query strings). */
export function blankToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value
}

/** "true" / "false" in a query string. */
export const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true')

export const MAX_PAGE_SIZE = 200

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
})

export type Pagination = z.infer<typeof paginationSchema>

/** For PATCH bodies: at least one field must be present. */
export function hasAtLeastOneField(value: Record<string, unknown>): boolean {
  return Object.values(value).some((field) => field !== undefined)
}

export const AT_LEAST_ONE_FIELD = { message: 'Provide at least one field to change' } as const
