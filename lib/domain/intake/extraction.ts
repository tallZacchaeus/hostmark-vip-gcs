// What the "others" field or a pasted message contains, as typed items (FR-IN-04). Produced by
// the Claude extractor when configured, otherwise by the offline rule-based reader
// (extract-rules.ts). Guest text is untrusted data: it is only ever read, never obeyed.
import { z } from 'zod'

export const REQUIREMENT_CATEGORIES = [
  'dietary',
  'accessibility',
  'room_preference',
  'security',
  'transport',
  'schedule',
  'medical',
  'other',
] as const

export type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number]

export const extractedItemSchema = z.object({
  category: z.enum(REQUIREMENT_CATEGORIES),
  detail: z.string().trim().min(1).max(1000),
  needs_attention: z.boolean(),
  /** The form field this contradicts (e.g. "flight_number", "party_size"), or null. */
  conflicts_with: z.string().max(200).nullable(),
})

export type ExtractedItem = z.infer<typeof extractedItemSchema>

/** More than this from one note is noise (and each item becomes a database row). */
export const MAX_EXTRACTED_ITEMS = 30

export const extractionResultSchema = z.object({ items: z.array(extractedItemSchema).max(MAX_EXTRACTED_ITEMS) })

export type ExtractionMethod = 'claude' | 'rules' | 'none'

export interface Extraction {
  readonly items: ExtractedItem[]
  readonly method: ExtractionMethod
  readonly model?: string
  readonly input_tokens?: number
  readonly output_tokens?: number
  readonly latency_ms?: number
  /** Set when the AI could not be reached; the submission then goes to review. */
  readonly error?: string
}

export const EMPTY_EXTRACTION: Extraction = { items: [], method: 'none' }
