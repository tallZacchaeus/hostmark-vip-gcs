// Labels and sentences for the Programme screen (Figma "Programme").
import type { IconName } from '@/components/ui/Icon'
import type { ItemState } from '@/lib/domain/programme/timeline'
import { formatTime } from '@/lib/client/format'
import type { ProgramItemView, ProgramParticipant } from '@/lib/repositories/programme'

export const PROGRAMME_PATH = '/api/programme'

export const KIND_LABELS: Readonly<Record<ProgramItemView['kind'], string>> = {
  session: 'Session',
  ceremony: 'Ceremony',
  meal: 'Meal',
  performance: 'Performance',
  other: 'Other',
}

export const ROLE_LABELS: Readonly<Record<ProgramParticipant['role'], string>> = {
  speaker: 'Speaker',
  honoree: 'Honoree',
  performer: 'Performer',
  attendee: 'Attendee',
}

export const STATUS_LABELS: Readonly<Record<ProgramItemView['status'], string>> = {
  draft: 'Draft',
  published: 'Published',
  cancelled: 'Cancelled',
}

export const STATE_BADGES: Readonly<Record<ItemState, { readonly label: string; readonly tone: string; readonly icon: IconName }>> = {
  track: { label: 'On track', tone: 'success', icon: 'check' },
  risk: { label: 'At risk', tone: 'warning', icon: 'alert' },
  done: { label: 'Done', tone: 'neutral', icon: 'check' },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: 'x' },
}

/** "Bishop Augustine Okafor (Cat. 1) is expected at the venue at 16:55. Welcome briefing starts at 17:00." */
export function riskSentence(item: Pick<ProgramItemView, 'title' | 'starts_at' | 'participants'>, timeZone: string): string {
  const late = item.participants.filter((participant) => participant.late)
  const who = late
    .map((participant) => `${participant.name}${participant.category ? ` (${participant.category})` : ''}${participant.expected_at ? ` is expected at the venue at ${formatTime(participant.expected_at, timeZone)}` : ''}`)
    .join('; ')
  return `${who || 'A participant is running late'}. ${item.title} starts at ${formatTime(item.starts_at, timeZone)}.`
}
