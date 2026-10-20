// Request schemas for guests and delegations (FR-IN-11). Limits mirror the CHECK constraints in
// db/migrations/20261019100000_guests_intake.sql.
import { z } from 'zod'
import { PARTY_ROLES, intakeFormSchema } from '@/lib/domain/intake/schema'
import { GUEST_TABS } from '@/lib/repositories/guests'
import {
  AT_LEAST_ONE_FIELD,
  e164PhoneSchema,
  hasAtLeastOneField,
  optionalText,
  paginationSchema,
  requiredText,
  uuidSchema,
} from './common'

const dietaryList = z.array(z.string().trim().min(1).max(100)).max(20)

export const guestListQuerySchema = paginationSchema.extend({
  tab: z.enum(GUEST_TABS).default('all'),
  search: z.string().trim().max(100).optional(),
  category_id: uuidSchema.optional(),
})

export type GuestListQuery = z.infer<typeof guestListQuerySchema>

const guestChangesSchema = z.object({
  title: optionalText(60),
  full_name: requiredText(200).optional(),
  organisation: optionalText(200),
  position: optionalText(200),
  vip_category_id: uuidSchema.nullable().optional(),
  proximity_priority: z.enum(['high', 'normal', 'low']).optional(),
  share_group: optionalText(50),
  dietary: dietaryList.optional(),
  accessibility: optionalText(500),
  phone: e164PhoneSchema.nullable().optional(),
  email: z.email('Enter a valid email').max(254).nullable().optional(),
  notes: optionalText(4000),
  status: z.enum(['expected', 'cancelled']).optional(),
})

export const guestUpdateSchema = guestChangesSchema
  .refine(hasAtLeastOneField, AT_LEAST_ONE_FIELD)
  .and(z.object({ version: z.number().int().min(1) }))

export type GuestUpdate = z.infer<typeof guestUpdateSchema>

export const memberCreateSchema = z.object({
  full_name: optionalText(200),
  member_role: z.enum(PARTY_ROLES),
  dietary: dietaryList.default([]),
  accessibility: optionalText(500),
  /** "Add as guest" on an extracted issue resolves that issue in the same change. */
  requirement_id: uuidSchema.optional(),
})

export type MemberCreate = z.infer<typeof memberCreateSchema>

export const manualGuestSchema = z.object({
  fields: intakeFormSchema,
  vip_category_id: uuidSchema.nullable().optional(),
  /** Set after the coordinator has seen the "possible duplicate" warning. */
  allow_duplicate: z.boolean().default(false),
})
