// Shapes of the guests API responses (lib/repositories/guests.ts) as the browser receives them.
import type { Tone } from '@/components/ui/Status'
import type { AuditEntry } from '@/lib/client/activity-format'
import type { RequirementCategory } from '@/lib/domain/intake/extraction'
import type { ArrivalMode, PartyRole } from '@/lib/domain/intake/schema'

export type MemberRole = PartyRole | 'principal'
export type PickupStatus = 'pending_assignment' | 'assigned' | 'en_route' | 'picked_up' | 'completed' | 'cancelled'

export interface DelegationRow {
  readonly delegation_id: string
  readonly delegation_name: string
  readonly principal_guest_id: string
  readonly title: string | null
  readonly full_name: string
  readonly category_id: string | null
  readonly category_name: string | null
  readonly companions: number
  readonly arrival_mode: ArrivalMode | null
  readonly arrival_at: string | null
  readonly arrival_status: string | null
  readonly flight_number: string | null
  readonly flight_phase: string | null
  readonly pickup_address: string | null
  readonly pickup_status: PickupStatus | null
  readonly pickup_at: string | null
  readonly open_issues: number
  readonly reference_code: string | null
  readonly room_number?: string | null
  readonly rooms_placed?: number
  readonly room_checked_in?: boolean
  readonly room_suggested?: boolean
}

export interface GuestTabs {
  readonly all: number
  readonly today: number
  readonly attention: number
  readonly arrived: number
}

export interface GuestList {
  readonly rows: DelegationRow[]
  readonly tabs: GuestTabs
  readonly totals: { readonly delegations: number; readonly guests: number }
}

export interface Member {
  readonly id: string
  readonly title: string | null
  readonly full_name: string | null
  readonly member_role: MemberRole
  readonly is_placeholder: boolean
  readonly status: string
  readonly dietary: string[]
  readonly accessibility: string | null
  readonly category_name: string | null
  readonly version: number
}

export interface Requirement {
  readonly id: string
  readonly guest_id: string
  readonly category: RequirementCategory
  readonly detail: string
  readonly source: 'form' | 'extraction' | 'coordinator'
  readonly needs_attention: boolean
  readonly conflicts_with: string | null
  readonly resolved_at: string | null
  readonly submission_source: 'form' | 'pasted_message' | null
  readonly reference_code: string | null
}

export interface Stay {
  readonly id: string
  readonly guest_id: string
  readonly status: 'planned' | 'checked_in'
  readonly expected_check_in_at: string
  readonly expected_check_out_at: string
  readonly is_manual_override: boolean
  readonly override_reason: string | null
  readonly room_id: string
  readonly number: string
  readonly floor: number
  readonly wing: string
  readonly room_type: string
}

export interface RoomSuggestion {
  readonly id: string
  readonly parent_id: string | null
  readonly guest_id: string
  readonly room_number: string | null
}

export interface GuestProfile {
  readonly guest: Member & {
    readonly delegation_id: string
    readonly organisation: string | null
    readonly position: string | null
    readonly vip_category_id: string | null
    readonly proximity_priority: 'high' | 'normal' | 'low'
    readonly share_group: string | null
    readonly notes: string | null
    readonly expected_departure_at: string | null
  }
  readonly delegation: {
    readonly id: string
    readonly name: string
    readonly status: string
    readonly contact_name: string | null
    readonly contact_email: string | null
    readonly contact_phone: string | null
  }
  readonly members: Member[]
  /** Current stays of the party (absent for roles without room access). */
  readonly stays?: Stay[]
  readonly room_suggestions?: RoomSuggestion[]
  readonly arrival: {
    readonly id: string
    readonly mode: ArrivalMode
    readonly stated_arrival_at: string | null
    readonly requested_pickup_at: string | null
    readonly pickup_address: string | null
    readonly expected_at_venue_at: string | null
    readonly status: string
  } | null
  readonly flight: {
    readonly id: string
    readonly flight_number: string
    readonly origin_iata: string | null
    readonly destination_iata: string | null
    readonly scheduled_arrival_at: string | null
    readonly estimated_arrival_at: string | null
    readonly actual_arrival_at: string | null
    /** A coordinator's own landing time (FR-FT-11); wins over flight data. */
    readonly manual_arrival_at: string | null
    readonly phase: string
  } | null
  readonly pickup: {
    readonly id: string
    readonly kind: 'airport' | 'location'
    readonly pickup_location: string
    readonly dropoff_location: string | null
    readonly pickup_at: string
    readonly passenger_count: number
    readonly status: PickupStatus
  } | null
  readonly requirements: Requirement[]
  readonly submissions: { readonly id: string; readonly reference_code: string; readonly source: string; readonly status: string; readonly submitted_at: string }[]
  readonly history: AuditEntry[]
}

export const PICKUP_STATUS: Readonly<Record<PickupStatus, { readonly label: string; readonly tone: Tone }>> = {
  pending_assignment: { label: 'Needs a driver', tone: 'warning' },
  assigned: { label: 'Driver assigned', tone: 'success' },
  en_route: { label: 'Driver on the way', tone: 'info' },
  picked_up: { label: 'Picked up', tone: 'info' },
  completed: { label: 'Pickup done', tone: 'success' },
  cancelled: { label: 'Pickup cancelled', tone: 'error' },
}

export const PROXIMITY_LABELS: Readonly<Record<'high' | 'normal' | 'low', string>> = {
  high: 'High (close to the principal and the venue)',
  normal: 'Normal',
  low: 'Low',
}
