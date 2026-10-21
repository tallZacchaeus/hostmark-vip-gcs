// Room preferences (FR-RA-02), weighted and explained: the principal's room tier matches their VIP
// rank; an accessible room and the ground floor for guests who need them; entourage members near
// their principal, weighted by each member's proximity priority. Pure.
import type { AllocRoom } from './rules'

export type ProximityPriority = 'high' | 'normal' | 'low'
export type PreferenceCode = 'tier' | 'accessible' | 'ground_floor' | 'proximity'
export type PreferenceStatus = 'met' | 'partly' | 'missed'
export type MatchLevel = 'High' | 'Partial' | 'Low'

export interface AllocGuest {
  readonly id: string
  readonly name: string
  readonly role_label: string
  readonly delegation_id: string
  readonly delegation_name: string
  readonly is_principal: boolean
  readonly principal_id: string | null
  /** The delegation's VIP rank (1 = highest), null when not categorised yet. */
  readonly rank: number | null
  /** The category's preferred room tier, when set. */
  readonly preferred_tier: number | null
  readonly proximity: ProximityPriority
  readonly share_group: string | null
  readonly needs_accessible: boolean
  readonly wants_ground_floor: boolean
  readonly check_in: number
  readonly check_out: number
}

export interface PreferenceResult {
  readonly code: PreferenceCode
  readonly status: PreferenceStatus
  readonly weight: number
  /** 0…1 */
  readonly score: number
  readonly text: string
}

export interface ScoreContext {
  readonly lowest_floor: number
  /** Where the guest's principal is (planned or already placed), if anywhere. */
  readonly principal_room: (principalId: string) => AllocRoom | undefined
}

export const WEIGHTS = { tier: 3, accessible: 3, ground_floor: 2 } as const
export const PROXIMITY_WEIGHTS: Readonly<Record<ProximityPriority, number>> = { high: 3, normal: 2, low: 1 }
const NEAR_DISTANCE = 9

const statusOf = (score: number): PreferenceStatus => (score >= 0.75 ? 'met' : score >= 0.3 ? 'partly' : 'missed')

/** The tier a principal should get: the category's preferred tier, else the rank itself. */
export const targetTier = (guest: AllocGuest): number | null => (guest.is_principal ? (guest.preferred_tier ?? guest.rank) : null)

/** Walking distance between rooms: floors weigh most, then wings, then doors along the corridor. */
export function roomDistance(a: AllocRoom, b: AllocRoom): number {
  if (a.id === b.id) return 0
  const floors = Math.abs(a.floor - b.floor) * 3
  return a.wing === b.wing ? floors + Math.min(3, Math.abs(a.position - b.position)) : floors + 4 + 3
}

function tierPreference(guest: AllocGuest, room: AllocRoom): PreferenceResult | null {
  const target = targetTier(guest)
  if (target === null) return null
  const gap = Math.abs(room.tier - target)
  const score = gap === 0 ? 1 : gap === 1 ? 0.5 : 0
  const text = gap === 0 ? 'Tier match' : `Tier ${room.tier} room for a tier ${target} guest`
  return { code: 'tier', status: statusOf(score), weight: WEIGHTS.tier, score, text }
}

function accessPreferences(guest: AllocGuest, room: AllocRoom, context: ScoreContext): PreferenceResult[] {
  const results: PreferenceResult[] = []
  if (guest.needs_accessible) {
    const score = room.is_accessible ? 1 : 0
    results.push({ code: 'accessible', status: statusOf(score), weight: WEIGHTS.accessible, score, text: room.is_accessible ? 'Accessible room' : `Room ${room.number} is not accessible` })
  }
  if (guest.wants_ground_floor) {
    const above = room.floor - context.lowest_floor
    const score = above <= 0 ? 1 : above === 1 ? 0.5 : 0
    results.push({ code: 'ground_floor', status: statusOf(score), weight: WEIGHTS.ground_floor, score, text: above <= 0 ? 'Ground floor' : `Floor ${room.floor}, not the ground floor` })
  }
  return results
}

function proximityPreference(guest: AllocGuest, room: AllocRoom, context: ScoreContext): PreferenceResult | null {
  if (guest.is_principal || !guest.principal_id) return null
  const principal = context.principal_room(guest.principal_id)
  if (!principal) return null
  const distance = roomDistance(room, principal)
  const score = Math.max(0, 1 - distance / NEAR_DISTANCE)
  const text =
    distance === 0
      ? 'Shares a room with the principal'
      : score >= 0.75
        ? `Next to the principal (room ${principal.number})`
        : `${room.number} is on floor ${room.floor} and the principal is in ${principal.number} on floor ${principal.floor}.`
  return { code: 'proximity', status: statusOf(score), weight: PROXIMITY_WEIGHTS[guest.proximity], score, text }
}

export function guestPreferences(guest: AllocGuest, room: AllocRoom, context: ScoreContext): PreferenceResult[] {
  return [tierPreference(guest, room), ...accessPreferences(guest, room, context), proximityPreference(guest, room, context)].filter(
    (result): result is PreferenceResult => result !== null,
  )
}

/** Weighted share of preferences met (1 when the guest has none). */
export function satisfaction(results: readonly PreferenceResult[]): number {
  const weight = results.reduce((sum, result) => sum + result.weight, 0)
  return weight === 0 ? 1 : results.reduce((sum, result) => sum + result.weight * result.score, 0) / weight
}

export const weightedScore = (results: readonly PreferenceResult[]): { readonly earned: number; readonly possible: number } => ({
  earned: results.reduce((sum, result) => sum + result.weight * result.score, 0),
  possible: results.reduce((sum, result) => sum + result.weight, 0),
})

export const matchLevel = (score: number): MatchLevel => (score >= 0.8 ? 'High' : score >= 0.4 ? 'Partial' : 'Low')

/** The short "why" for a plan line: the most telling preference. */
export function headline(results: readonly PreferenceResult[]): string {
  const missed = results.find((result) => result.status !== 'met')
  if (missed) return missed.code === 'proximity' ? 'Proximity partly met' : missed.text
  const proximity = results.find((result) => result.code === 'proximity')
  if (proximity) return proximity.score === 1 ? 'Shares with principal' : 'Next to principal'
  return results[0]?.text ?? 'Free and ready'
}
