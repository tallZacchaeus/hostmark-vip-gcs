// The hard rules for a room (FR-RA-01), the same as the database's private.room_unavailability:
// in service; clean, or cleanable before the guests arrive; no overlap with another room group
// (each stay keeps the room until it has been cleaned after checkout); enough beds. Guests share
// a room only within one room-share group (FR-RA-03). Pure; times are epoch milliseconds.

export type HousekeepingStatus = 'clean' | 'needs_cleaning' | 'cleaning'
export type RoomBlocker = 'out_of_service' | 'not_ready' | 'occupied' | 'capacity'

export interface AllocRoom {
  readonly id: string
  readonly number: string
  readonly floor: number
  readonly wing: string
  readonly position: number
  readonly type_name: string
  readonly tier: number
  readonly capacity: number
  readonly is_accessible: boolean
  readonly out_of_service: boolean
  readonly housekeeping_status: HousekeepingStatus
  /** Cleaning minutes for the room type plus the event's delay buffer. */
  readonly turnaround_min: number
  /**
   * When the room is expected to be clean (private.room_ready_at, P5): null when clean now. When
   * absent, a room that is not clean is assumed to need a full turnaround from now.
   */
  readonly ready_at?: number | null
}

/** A guest in a room (existing or planned). */
export interface Occupant {
  readonly room_id: string
  readonly guest_id: string
  readonly share_group: string | null
  readonly check_in: number
  readonly check_out: number
}

/** Guests who will be in one room together: one guest, or a coordinator's share group. */
export interface StayRequest {
  readonly guest_ids: readonly string[]
  readonly share_group: string | null
  readonly check_in: number
  readonly check_out: number
}

const MINUTE = 60_000

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number): boolean => aStart < bEnd && bStart < aEnd

/** Why `request` cannot go into `room` alongside `occupants`, or null when it can. */
export function roomBlocker(room: AllocRoom, request: StayRequest, occupants: readonly Occupant[], now: number): RoomBlocker | null {
  if (room.out_of_service) return 'out_of_service'
  const turnaround = room.turnaround_min * MINUTE
  const readyAt = room.ready_at !== undefined ? room.ready_at : room.housekeeping_status === 'clean' ? null : now + turnaround
  if (readyAt !== null && readyAt > request.check_in) return 'not_ready'
  const sharing = occupants.filter(
    (occupant) =>
      occupant.room_id === room.id &&
      !request.guest_ids.includes(occupant.guest_id) &&
      overlaps(occupant.check_in, occupant.check_out + turnaround, request.check_in, request.check_out + turnaround),
  )
  if (sharing.some((occupant) => request.share_group === null || occupant.share_group !== request.share_group)) return 'occupied'
  return sharing.length + request.guest_ids.length > room.capacity ? 'capacity' : null
}

export const BLOCKER_TEXT: Readonly<Record<RoomBlocker | 'checked_in', string>> = {
  out_of_service: 'The room is out of service.',
  not_ready: 'The room cannot be cleaned before the guest arrives.',
  occupied: 'Someone else is in the room at that time.',
  capacity: 'The room does not have enough beds.',
  checked_in: 'The guest is already checked in to their room.',
}
