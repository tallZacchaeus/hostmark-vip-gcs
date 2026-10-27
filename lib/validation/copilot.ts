// Co-Pilot request body. Limits mirror copilot_exchanges (question and transcript ≤ 2000 characters).
import { z } from 'zod'
import { requiredText, uuidSchema } from './common'

export const copilotQuestionSchema = z.object({
  message: requiredText(2000),
  conversation_id: uuidSchema.optional(),
  input_mode: z.enum(['text', 'voice']).default('text'),
  transcript_original: z.string().trim().max(2000).nullable().optional(),
})
export type CopilotQuestionInput = z.infer<typeof copilotQuestionSchema>
