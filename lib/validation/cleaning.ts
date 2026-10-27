// Cleaning request bodies. The note limit mirrors cleaning_tasks.problem_note (500 characters).
import { z } from 'zod'
import { optionalText } from './common'

export const reportProblemSchema = z.object({
  kind: z.enum(['maintenance', 'supplies', 'other'], 'Choose what the problem is'),
  note: optionalText(500),
})
