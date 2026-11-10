// Response shapes of the Events API (P9 step 9.4; docs/05-Backend-Schema.md section 7).

export type EventStatus = 'draft' | 'live' | 'archived'

/** GET /api/events: an event this person manages. */
export interface ManagedEvent {
  readonly id: string
  readonly name: string
  readonly venue_name: string
  readonly status: EventStatus
  readonly starts_on: string
  readonly ends_on: string
  readonly owner_id: string | null
  readonly owner_name: string | null
  readonly member_count: number
  readonly is_current: boolean
}

/** GET /api/events/[id]/staff: a staff account, and whether it works on the event. */
export interface StaffOption {
  readonly id: string
  readonly full_name: string
  readonly email: string
  readonly role: string
  readonly is_member: boolean
}

export const COPY_PARTS = ['settings', 'rooms', 'categories', 'drivers', 'staff'] as const
export type CopyPart = (typeof COPY_PARTS)[number]

/** POST /api/events/[id]/copy: what was copied. */
export type CopyCounts = Partial<Record<'room_types' | 'rooms' | 'categories' | 'drivers' | 'staff', number>>
