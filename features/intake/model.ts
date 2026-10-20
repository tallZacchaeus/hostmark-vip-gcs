// Labels and small helpers shared by the registration form, the intake queue, the review screen
// and the guest screens. Types mirror the API responses (lib/repositories/intake.ts, guests.ts).
import type { Tone } from '@/components/ui/Status'
import type { ExtractedItem, RequirementCategory } from '@/lib/domain/intake/extraction'
import type { ArrivalMode, IntakeFields, PartyMember, PartyRole } from '@/lib/domain/intake/schema'
import type { IntakeIssue } from '@/lib/domain/intake/validate'

export type { ArrivalMode, ExtractedItem, IntakeFields, IntakeIssue, PartyMember, PartyRole }

export const ARRIVAL_MODE_LABELS: Readonly<Record<ArrivalMode, string>> = {
  flying: 'Flying',
  own_transport: 'Own transport',
  pickup: 'Pickup requested',
}

export const PARTY_ROLE_LABELS: Readonly<Record<PartyRole, string>> = {
  family: 'Family (spouse, child)',
  assistant: 'Assistant, aide or chaplain',
  security: 'Security',
  performer: 'Performer',
  representative: 'Representative',
  other: 'Other',
}

export const MEMBER_ROLE_LABELS: Readonly<Record<PartyRole | 'principal', string>> = {
  principal: 'Principal',
  family: 'Family',
  assistant: 'Assistant',
  security: 'Security',
  performer: 'Performer',
  representative: 'Representative',
  other: 'Other',
}

export const REQUIREMENT_LABELS: Readonly<Record<RequirementCategory, string>> = {
  dietary: 'Dietary',
  accessibility: 'Accessibility',
  room_preference: 'Room preference',
  security: 'Security',
  transport: 'Transport',
  schedule: 'Schedule',
  medical: 'Medical',
  other: 'Other',
}

export const TITLES = ['Bishop', 'Archbishop', 'Rev.', 'Pastor', 'Imam', 'Dr', 'Prof.', 'Hon.', 'Chief', 'H.E.', 'Mr', 'Mrs', 'Ms'] as const

export const EMPTY_FIELDS: IntakeFields = {
  title: '',
  full_name: '',
  organisation: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  arrival_mode: undefined,
  airline: '',
  flight_number: '',
  arrival_date: '',
  arrival_time: '',
  pickup_address: '',
  departure_date: '',
  dietary: '',
  accessibility: '',
  others: '',
  party: [],
}

export const EMPTY_MEMBER: PartyMember = { name: '', role: 'other', dietary: '', accessibility: '' }

/** Fills gaps in a stored or drafted form so every input is controlled. */
export function completeFields(fields: Partial<IntakeFields> | null | undefined): IntakeFields {
  const merged = { ...EMPTY_FIELDS, ...(fields ?? {}) }
  return { ...merged, party: (merged.party ?? []).map((member) => ({ ...EMPTY_MEMBER, ...member })) }
}

/** The first message per field, for marking inputs (errors win over warnings). */
export function fieldMessages(issues: readonly IntakeIssue[]): Partial<Record<string, string>> {
  const ordered = [...issues].sort((a, b) => (a.severity === 'error' ? -1 : 0) - (b.severity === 'error' ? -1 : 0))
  const messages: Partial<Record<string, string>> = {}
  for (const issue of ordered) {
    if (issue.field && !messages[issue.field]) messages[issue.field] = issue.message
  }
  return messages
}

export interface Reason {
  readonly label: string
  readonly tone: Tone
}

/** Short reasons for the queue ("Likely duplicate", "Missing details", "Flagged"). */
export function reasonsOf(issues: readonly IntakeIssue[], duplicate: 'none' | 'exact' | 'likely'): Reason[] {
  const reasons: Reason[] = []
  if (duplicate === 'likely') reasons.push({ label: 'Likely duplicate', tone: 'info' })
  if (duplicate === 'exact') reasons.push({ label: 'Exact duplicate', tone: 'info' })
  if (issues.some((issue) => issue.code.startsWith('missing_'))) reasons.push({ label: 'Missing details', tone: 'warning' })
  if (issues.some((issue) => issue.code === 'flight_number_invalid' || issue.code === 'airline_mismatch')) reasons.push({ label: 'Check flight', tone: 'warning' })
  if (issues.some((issue) => issue.code === 'arrival_outside_window')) reasons.push({ label: 'Date outside event', tone: 'warning' })
  if (issues.some((issue) => issue.code.startsWith('others_') || issue.code === 'ai_unavailable')) reasons.push({ label: 'Flagged in note', tone: 'warning' })
  if (issues.some((issue) => issue.code === 'auto_process_failed')) reasons.push({ label: 'Needs approval', tone: 'warning' })
  if (reasons.length === 0 && issues.some((issue) => issue.severity !== 'info')) reasons.push({ label: 'Check details', tone: 'warning' })
  return reasons
}

export function guestName(title: string | null | undefined, fullName: string | null | undefined): string {
  return [title, fullName].filter((part) => part && part.trim() !== '').join(' ') || 'Unnamed guest'
}

export type SubmissionStatus = 'received' | 'processing' | 'auto_processed' | 'needs_review' | 'approved' | 'rejected' | 'linked_duplicate'

export const SUBMISSION_STATUS: Readonly<Record<SubmissionStatus, Reason>> = {
  received: { label: 'Received', tone: 'neutral' },
  processing: { label: 'Processing', tone: 'neutral' },
  auto_processed: { label: 'Processed automatically', tone: 'success' },
  needs_review: { label: 'Needs review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'error' },
  linked_duplicate: { label: 'Linked to existing', tone: 'info' },
}
