// Response shapes of the P1 admin API (docs/05-Backend-Schema.md section 7).
import type { AppRole } from '@/lib/auth/roles'

export interface Account {
  readonly id: string
  readonly full_name: string
  readonly email: string
  readonly role: AppRole
  readonly phone: string | null
  readonly active: boolean
  readonly deactivation_reason: string | null
  readonly must_change_password: boolean
  readonly created_at: string
}

export interface RoomType {
  readonly id: string
  readonly name: string
  readonly tier: number
  readonly default_capacity: number
  readonly cleaning_minutes: number
}

export interface Room {
  readonly id: string
  readonly number: string
  readonly floor: number
  readonly wing: string
  readonly position: number
  readonly room_type_id: string
  readonly capacity: number
  readonly is_accessible: boolean
  readonly out_of_service: boolean
  readonly housekeeping_status: 'clean' | 'needs_cleaning' | 'cleaning'
  readonly notes: string | null
}

export interface Driver {
  readonly id: string
  readonly profile_id: string | null
  readonly full_name: string
  readonly phone: string | null
  readonly vehicle_label: string | null
  readonly vehicle_capacity: number
  readonly is_active: boolean
}

export interface DriverShift {
  readonly id: string
  readonly driver_id: string
  readonly starts_at: string
  readonly ends_at: string
}

export interface VipCategory {
  readonly id: string
  readonly name: string
  readonly rank: number
  readonly preferred_room_tier: number | null
}

export interface EventSettings {
  readonly id: string
  readonly name: string
  readonly venue_name: string
  readonly timezone: string
  readonly starts_on: string
  readonly ends_on: string
  readonly arrival_airports: string[]
  readonly intake_token: string
  readonly intake_open: boolean
  readonly intake_window_days: number
  readonly airport_exit_buffer_min: number
  readonly airport_travel_min: number
  readonly local_travel_min: number
  readonly delay_threshold_min: number
  readonly cleaning_delay_buffer_min: number
  readonly program_lead_time_min: number
  readonly flight_mode: 'live' | 'simulated'
  readonly auto_process_enabled: boolean
  /** The coordination desk's phone (E.164), shown to drivers as "Call coordinator". */
  readonly coordinator_phone: string | null
}
