// Reads free text for the intake pipeline (FR-IN-04/05) behind one interface: Claude when
// ANTHROPIC_API_KEY is set, otherwise the offline rules (lib/domain/intake/extract-rules.ts).
// Either way the result has the same shape, and the submission records which reader produced it.
import 'server-only'
import { type ExtractionContext, draftFromMessageWithRules, extractWithRules } from '@/lib/domain/intake/extract-rules'
import { EMPTY_EXTRACTION, type Extraction } from '@/lib/domain/intake/extraction'
import type { IntakeFields } from '@/lib/domain/intake/schema'
import { getServerEnv } from '@/lib/env'
import { logger } from '@/lib/logger'

export interface MessageContext {
  readonly year: number
  readonly event_name: string
}

export interface MessageReading {
  readonly fields: Partial<IntakeFields>
  readonly extraction: Extraction
}

export interface IntakeReader {
  /** The guest's "anything else" note → typed items. */
  readOthers(text: string, context: ExtractionContext): Promise<Extraction>
  /** A forwarded message → a draft of the form plus typed items. */
  readMessage(text: string, context: MessageContext): Promise<MessageReading>
}

export const rulesReader: IntakeReader = {
  async readOthers(text, context) {
    if (text.trim() === '') return EMPTY_EXTRACTION
    return { items: extractWithRules(text, context), method: 'rules' }
  },
  async readMessage(text, context) {
    const draft = draftFromMessageWithRules(text, context.year)
    return { fields: draft.fields, extraction: { items: draft.items, method: 'rules' } }
  },
}

let configured: Promise<IntakeReader> | undefined

export function getIntakeReader(): Promise<IntakeReader> {
  configured ??= (async () => {
    const env = getServerEnv()
    if (!env.ANTHROPIC_API_KEY) return rulesReader
    const { createClaudeReader } = await import('./claude-intake-reader')
    logger.info('Intake free text is read by Claude', { model: env.INTAKE_AI_MODEL })
    return createClaudeReader({ apiKey: env.ANTHROPIC_API_KEY, model: env.INTAKE_AI_MODEL, fallback: rulesReader })
  })()
  return configured
}

/** Tests swap the reader (e.g. a fake Claude) without touching the environment. */
export function setIntakeReaderForTesting(reader: IntakeReader | undefined): void {
  configured = reader ? Promise.resolve(reader) : undefined
}
