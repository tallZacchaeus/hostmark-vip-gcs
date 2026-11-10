// Turns audit_log rows into the Activity screen's sentences ("Tolu Adebayo updated room 412")
// and change lists (field: old → new). Each phase adds its tables to TABLES.
import type { IconName } from '@/components/ui/Icon'

export type ActivityDomain = 'Arrivals' | 'Transport' | 'Rooms' | 'Sanitation' | 'Intake' | 'Programme' | 'Setup'
export type ActorType = 'user' | 'system' | 'copilot' | 'guest_intake'

export interface AuditEntry {
  readonly id: string
  readonly occurred_at: string
  readonly actor_type: ActorType
  readonly actor_id: string | null
  readonly actor_name: string | null
  readonly action: string
  readonly entity_type: string
  readonly entity_id: string
  readonly before: Record<string, unknown> | null
  readonly after: Record<string, unknown> | null
  readonly reason: string | null
  readonly proposal_id: string | null
  readonly is_automatic: boolean
  readonly undoable: boolean
  readonly undo_of_audit_id: string | null
  readonly undone: boolean
}

export interface Change {
  readonly label: string
  readonly oldValue: string
  readonly newValue: string
}

type Row = Record<string, unknown>

interface TableInfo {
  readonly domain: ActivityDomain
  readonly noun: string
  readonly name?: (row: Row) => string | undefined
  /** A fixed screen, or one built from the record (e.g. its guest profile). */
  readonly href?: string | ((row: Row, entityId: string) => string | undefined)
}

const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined)
const joined = (...values: unknown[]): string | undefined => text(values.map(text).filter(Boolean).join(' '))
const guestLink = (id: unknown): string | undefined => (text(id) ? `/guests/${String(id)}` : undefined)

const TABLES: Readonly<Record<string, TableInfo>> = {
  rooms: { domain: 'Rooms', noun: 'room', name: (row) => text(row.number), href: '/rooms' },
  room_types: { domain: 'Rooms', noun: 'room type', name: (row) => text(row.name), href: '/settings?tab=rooms' },
  drivers: { domain: 'Transport', noun: 'driver', name: (row) => text(row.full_name), href: '/settings?tab=drivers' },
  driver_shifts: { domain: 'Transport', noun: 'driver shift', href: '/settings?tab=drivers' },
  vip_categories: { domain: 'Setup', noun: 'VIP category', name: (row) => text(row.name), href: '/settings?tab=categories' },
  events: { domain: 'Setup', noun: 'event settings', href: '/settings?tab=system' },
  profiles: { domain: 'Setup', noun: 'account', name: (row) => text(row.full_name), href: '/settings?tab=users' },
  proposals: { domain: 'Setup', noun: 'suggestion', name: (row) => text(row.title), href: '/dashboard#approvals' },
  intake_submissions: { domain: 'Intake', noun: 'registration', name: (row) => text(row.reference_code), href: (_row, id) => `/intake/${id}` },
  delegations: { domain: 'Intake', noun: 'delegation', name: (row) => text(row.name), href: (_row, id) => guestLink(id) },
  guests: { domain: 'Intake', noun: 'guest', name: (row) => joined(row.title, row.full_name), href: (_row, id) => guestLink(id) },
  guest_requirements: { domain: 'Intake', noun: 'guest note', name: (row) => text(row.detail), href: (row) => guestLink(row.guest_id) },
  arrivals: { domain: 'Arrivals', noun: 'arrival', href: (row) => guestLink(row.delegation_id) },
  flights: { domain: 'Arrivals', noun: 'flight', name: (row) => text(row.flight_number), href: '/arrivals' },
  pickups: { domain: 'Transport', noun: 'pickup', name: (row) => text(row.pickup_location), href: '/transport' },
  room_assignments: { domain: 'Rooms', noun: 'stay', href: (row) => guestLink(row.guest_id) },
  cleaning_tasks: { domain: 'Sanitation', noun: 'cleaning task', href: '/sanitation' },
  program_items: { domain: 'Programme', noun: 'programme item', name: (row) => text(row.title), href: '/programme' },
  program_participants: { domain: 'Programme', noun: 'programme participant', href: '/programme' },
}

/** Tables shown for each "Type" filter value. */
export function tablesForDomain(domain: ActivityDomain): string[] {
  return Object.entries(TABLES)
    .filter(([, info]) => info.domain === domain)
    .map(([table]) => table)
}

export const DOMAIN_ICONS: Readonly<Record<ActivityDomain, IconName>> = {
  Arrivals: 'plane',
  Transport: 'car',
  Rooms: 'bed',
  Sanitation: 'spray',
  Intake: 'inbox',
  Programme: 'calendar',
  Setup: 'settings',
}

export function domainOf(entityType: string): ActivityDomain {
  return TABLES[entityType]?.domain ?? 'Setup'
}

export function actorLabel(entry: Pick<AuditEntry, 'actor_type' | 'actor_name'>): string {
  switch (entry.actor_type) {
    case 'system':
      return 'The system'
    case 'copilot':
      return 'Victoria'
    case 'guest_intake':
      return 'Guest registration'
    default:
      return entry.actor_name ?? 'A staff member'
  }
}

export interface ActivityObject {
  readonly label: string
  readonly href?: string
}

export function objectOf(entry: Pick<AuditEntry, 'entity_type' | 'before' | 'after'> & { readonly entity_id?: string }): ActivityObject {
  const info = TABLES[entry.entity_type]
  const row = entry.after ?? entry.before ?? {}
  const noun = info?.noun ?? entry.entity_type.replace(/_/g, ' ').replace(/s$/, '')
  const name = info?.name?.(row)
  const label = name ? (info?.noun === 'suggestion' ? `“${name}”` : `${noun} ${name}`) : noun
  const href = typeof info?.href === 'function' ? info.href(row, entry.entity_id ?? '') : info?.href
  return { label, href }
}

const NAMED_VERBS: Readonly<Record<string, string>> = {
  'profiles.create': 'created the',
  'profiles.password_reset': 'reset the password for the',
  'proposals.create': 'suggested',
  'proposals.reject': 'rejected',
  'proposals.supersede': 'replaced an older',
  'proposals.expire': 'marked as expired the',
  seed: 'loaded demo data:',
  'rooms.check_in': 'checked in the',
  'rooms.undo_check_in': 'undid the check-in of the',
  'rooms.check_out': 'checked out the',
  'rooms.reverse_checkout': 'reversed the check-out of the',
  'rooms.assign': 'assigned a room for the',
  'cleaning.start': 'started the',
  'cleaning.complete': 'finished the',
  'cleaning.undo_complete': 'reopened the',
  'cleaning.report_problem': 'reported a problem on the',
  'programme.notify_team': 'alerted the programs team about the',
}

/** "updated", "added", "removed", "undid a change to the", … followed by the object. */
export function verbOf(action: string): string {
  const named = NAMED_VERBS[action]
  if (named) return named
  const operation = action.split('.').at(-1)
  switch (operation) {
    case 'insert':
      return 'added'
    case 'update':
      return 'updated'
    case 'delete':
      return 'removed'
    case 'undo':
      return 'undid a change to'
    default:
      return operation ? operation.replace(/_/g, ' ') : 'changed'
  }
}

const IGNORED_FIELDS = new Set(['id', 'event_id', 'created_at', 'updated_at', 'version'])
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

export function fieldLabel(field: string): string {
  const words = field.replace(/_id$/, '').replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function formatValue(value: unknown, formatTimestamp: (iso: string) => string): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string' && TIMESTAMP.test(value)) return formatTimestamp(value)
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** Field-by-field differences between the before and after images of an update. */
export function changesOf(entry: Pick<AuditEntry, 'before' | 'after'>, formatTimestamp: (iso: string) => string): Change[] {
  const before = entry.before ?? {}
  const after = entry.after ?? {}
  const fields = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...fields]
    .filter((field) => !IGNORED_FIELDS.has(field) && JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => ({
      label: fieldLabel(field),
      oldValue: entry.before ? formatValue(before[field], formatTimestamp) : '—',
      newValue: entry.after ? formatValue(after[field], formatTimestamp) : '—',
    }))
}
