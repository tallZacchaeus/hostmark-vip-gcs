// Shared shapes and wording for the Co-Pilot's answers: short sentences, times in the event's time
// zone, at most a handful of names before "and N more", and a citation for each record used (FR-CP-03).
import { formatTime } from '@/lib/client/format'

export interface Citation {
  readonly label: string
  readonly href: string
}

export interface ToolAnswer {
  readonly answer: string
  readonly citations: Citation[]
}

export interface ToolContext {
  readonly now: Date
  readonly timezone: string
}

const MAX_LISTED = 6

export const time = (value: Date | string | null | undefined, context: ToolContext): string => (value ? formatTime(value, context.timezone) : 'time unknown')

export const plural = (count: number, singular: string, pluralForm = `${singular}s`): string => `${count} ${count === 1 ? singular : pluralForm}`

/** "A, B and C", or "A, B, C and 4 more". */
export function listOf(items: readonly string[]): string {
  const shown = items.slice(0, MAX_LISTED)
  const extra = items.length - shown.length
  if (extra > 0) return `${shown.join(', ')} and ${extra} more`
  if (shown.length <= 1) return shown.join('')
  return `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`
}

export const guestCitation = (label: string, delegationId: string): Citation => ({ label, href: `/guests/${delegationId}` })

export const citeOnce = (citations: readonly Citation[]): Citation[] => [...new Map(citations.map((citation) => [`${citation.href}|${citation.label}`, citation])).values()].slice(0, MAX_LISTED * 2)
