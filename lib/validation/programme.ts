// Programme request bodies. Limits mirror the CHECK constraints on program_items.
import { z } from 'zod'
import { optionalText, requiredText, uuidSchema } from './common'

const isoInstant = z.iso.datetime({ offset: true, message: 'Use a date and time with a time zone, e.g. 2026-11-20T17:00:00+01:00' })

export const PROGRAM_KINDS = ['session', 'ceremony', 'meal', 'performance', 'other'] as const
export const PROGRAM_STATUSES = ['draft', 'published', 'cancelled'] as const
export const PROGRAM_ROLES = ['speaker', 'honoree', 'performer', 'attendee'] as const
const MAX_PARTICIPANTS = 100

export const programItemSchema = z
  .object({
    title: requiredText(200),
    kind: z.enum(PROGRAM_KINDS),
    starts_at: isoInstant,
    ends_at: isoInstant,
    location: requiredText(120),
    description: optionalText(2000),
    // Required (no default) so an edit can never unpublish an item by leaving it out.
    status: z.enum(PROGRAM_STATUSES),
  })
  .refine((item) => Date.parse(item.ends_at) > Date.parse(item.starts_at), { message: 'The end must be after the start', path: ['ends_at'] })
export type ProgramItemInput = z.infer<typeof programItemSchema>

export const participantsSchema = z.object({
  participants: z
    .array(z.object({ guest_id: uuidSchema, role: z.enum(PROGRAM_ROLES) }))
    .max(MAX_PARTICIPANTS, `At most ${MAX_PARTICIPANTS} participants`)
    .refine((list) => new Set(list.map((item) => item.guest_id)).size === list.length, 'Each guest can be listed once'),
})
export type ParticipantsInput = z.infer<typeof participantsSchema>
