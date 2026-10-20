// Request schemas for intake (FR-IN-01…10). The form itself is lib/domain/intake/schema.ts,
// shared with the public page and the review screen.
import { z } from 'zod'
import { intakeFieldsSchema, publicRegistrationSchema } from '@/lib/domain/intake/schema'
import { INTAKE_TABS } from '@/lib/repositories/intake'
import { optionalText, paginationSchema, uuidSchema } from './common'

export const MAX_PASTED_MESSAGE_LENGTH = 4000

/** Tokens are 32 hex characters today; anything URL-safe is accepted and looked up. */
export const intakeTokenParamsSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, 'Invalid link') })

export { publicRegistrationSchema }

export const pastedMessageSchema = z.object({
  text: z.string().trim().min(10, 'Paste the whole message').max(MAX_PASTED_MESSAGE_LENGTH, `At most ${MAX_PASTED_MESSAGE_LENGTH} characters`),
})

export const submissionListQuerySchema = paginationSchema.extend({
  tab: z.enum(INTAKE_TABS).default('review'),
  search: z.string().trim().max(100).optional(),
  source: z.enum(['form', 'pasted_message']).optional(),
})

export const submissionUpdateSchema = z.object({ fields: intakeFieldsSchema })

export const approveSubmissionSchema = z.object({
  fields: intakeFieldsSchema.optional(),
  vip_category_id: uuidSchema.nullable().optional(),
})

export const linkSubmissionSchema = z.object({ delegation_id: uuidSchema, note: optionalText(2000) })

export const rejectSubmissionSchema = z.object({ note: optionalText(2000) })
