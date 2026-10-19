// Staff accounts (FR-PL-01) and the signed-in user's password change.
import { z } from 'zod'
import { newPasswordSchema } from '@/lib/auth/password-policy'
import { APP_ROLES } from '@/lib/auth/roles'
import { AT_LEAST_ONE_FIELD, booleanQuery, e164PhoneSchema, hasAtLeastOneField, optionalText, paginationSchema, requiredText } from './common'

const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'))
const roleSchema = z.enum(APP_ROLES)

export const accountCreateSchema = z.strictObject({
  email: emailSchema,
  full_name: requiredText(200),
  role: roleSchema,
  phone: e164PhoneSchema.optional(),
})

export const accountUpdateSchema = z
  .strictObject({
    full_name: requiredText(200).optional(),
    phone: e164PhoneSchema.nullable().optional(),
    role: roleSchema.optional(),
    /** false deactivates the account and signs it out everywhere. */
    active: z.boolean().optional(),
    deactivation_reason: optionalText(500),
  })
  .refine(({ deactivation_reason: _reason, ...changes }) => hasAtLeastOneField(changes), AT_LEAST_ONE_FIELD)
  .refine((value) => value.deactivation_reason === undefined || value.active === false, {
    message: 'A deactivation reason can only be given together with "active": false',
    path: ['deactivation_reason'],
  })

export const accountListQuerySchema = paginationSchema.extend({
  role: roleSchema.optional(),
  active: booleanQuery.optional(),
  search: z.string().trim().min(1).max(100).optional(),
})

export const passwordChangeSchema = z
  .strictObject({
    current_password: z.string().min(1, 'Enter your current password').max(128),
    new_password: newPasswordSchema,
  })
  .refine((value) => value.current_password !== value.new_password, {
    message: 'Choose a password different from the current one',
    path: ['new_password'],
  })

export type AccountCreate = z.infer<typeof accountCreateSchema>
export type AccountUpdate = z.infer<typeof accountUpdateSchema>
export type AccountListQuery = z.infer<typeof accountListQuerySchema>
