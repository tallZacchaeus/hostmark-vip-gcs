// Room allocation evaluation (PRD §8, M3), the pure part: seeded synthetic venues and guest lists,
// and a hard-rule checker written independently of the allocator's own rules, so "100% of
// allocations satisfy the hard rules" is checked rather than assumed.
import type { AllocationInput, AllocationPlan } from '@/lib/domain/rooms/allocator'
import type { AllocRoom, HousekeepingStatus } from '@/lib/domain/rooms/rules'
import type { AllocGuest, ProximityPriority } from '@/lib/domain/rooms/score'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const BUFFER_MIN = 15
/** The seeded venue's wings: corridor positions per floor. */
const WINGS = [
  { name: 'West', first: 1, last: 7 },
  { name: 'East', first: 8, last: 14 },
  { name: 'Garden', first: 15, last: 20 },
] as const
const TYPES = [
  { name: 'Presidential Suite', tier: 1, capacity: 2, cleaning: 90 },
  { name: 'Executive Suite', tier: 2, capacity: 2, cleaning: 60 },
  { name: 'Deluxe', tier: 3, capacity: 2, cleaning: 45 },
  { name: 'Standard', tier: 4, capacity: 1, cleaning: 30 },
] as const
const PROXIMITY: readonly ProximityPriority[] = ['high', 'normal', 'normal', 'low']

export interface Scenario {
  readonly name: string
  readonly floors: number
  readonly delegations: number
  /** Hours from the first event day's midnight to "now" (negative: before the event). */
  readonly now_offset_h: number
}

/** Small seeded PRNG (mulberry32), so a seed always gives the same instance. */
export function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

const between = (rand: () => number, min: number, max: number): number => Math.floor(min + rand() * (max - min + 1))
const pick = <T>(rand: () => number, items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T

function typeForFloor(floor: number, floors: number): (typeof TYPES)[number] {
  if (floor === floors) return TYPES[0]
  if (floor === floors - 1) return TYPES[1]
  return floor >= 3 ? TYPES[2] : TYPES[3]
}

function housekeeping(rand: () => number): { readonly status: HousekeepingStatus; readonly out: boolean } {
  const roll = rand()
  if (roll < 0.02) return { status: 'clean', out: true }
  if (roll < 0.05) return { status: 'cleaning', out: false }
  return { status: roll < 0.13 ? 'needs_cleaning' : 'clean', out: false }
}

export function buildRooms(rand: () => number, floors: number): AllocRoom[] {
  return Array.from({ length: floors }, (_, index) => index + 1).flatMap((floor) =>
    WINGS.flatMap((wing) =>
      Array.from({ length: wing.last - wing.first + 1 }, (_, offset) => {
        const type = typeForFloor(floor, floors)
        const state = housekeeping(rand)
        const position = wing.first + offset
        return {
          id: `room-${floor * 100 + position}`,
          number: String(floor * 100 + position),
          floor,
          wing: wing.name,
          position,
          type_name: type.name,
          tier: type.tier,
          capacity: type.capacity,
          is_accessible: floor === 1 && offset < 2,
          out_of_service: state.out,
          housekeeping_status: state.status,
          turnaround_min: type.cleaning + BUFFER_MIN,
        }
      }),
    ),
  )
}

/** Rank 1 is rare and rank 4 (entourage-only groups) common, as at a real summit. */
const rankFor = (rand: () => number): number => pick(rand, [1, 2, 2, 3, 3, 3, 4, 4])

function delegation(rand: () => number, index: number): AllocGuest[] {
  const id = `del-${index}`
  const rank = rankFor(rand)
  const size = between(rand, 1, 5)
  const proximity = pick(rand, PROXIMITY)
  const check_in = between(rand, 6, 40) * HOUR
  const check_out = check_in + between(rand, 2, 4) * DAY
  const spouseShares = size > 1 && rand() < 0.4
  return Array.from({ length: size }, (_, member) => {
    const principal = member === 0
    const shares = spouseShares && member <= 1
    return {
      id: `${id}-g${member}`,
      name: `Guest ${index}.${member}`,
      role_label: principal ? 'Principal' : member === 1 ? 'Spouse' : 'Aide',
      delegation_id: id,
      delegation_name: `Delegation ${index}`,
      is_principal: principal,
      principal_id: principal ? null : `${id}-g0`,
      rank,
      preferred_tier: rand() < 0.8 ? rank : null,
      proximity,
      share_group: shares ? `${id}-couple` : null,
      needs_accessible: rand() < 0.05,
      wants_ground_floor: rand() < 0.06,
      check_in: check_in + (member === 0 ? 0 : between(rand, 0, 3) * HOUR),
      check_out,
    }
  })
}

export function buildInstance(scenario: Scenario, seed: number): AllocationInput {
  const rand = random(seed)
  const rooms = buildRooms(rand, scenario.floors)
  const guests = Array.from({ length: scenario.delegations }, (_, index) => delegation(rand, index)).flat()
  return { rooms, occupants: [], placed: new Map(), guests, now: scenario.now_offset_h * HOUR }
}

export interface RuleViolation {
  readonly guest_id: string
  readonly rule: 'unknown_room' | 'placed_twice' | 'out_of_service' | 'not_ready' | 'shared_outside_group' | 'over_capacity'
}

interface PlannedStay {
  readonly guest_id: string
  readonly share_group: string | null
  readonly check_in: number
  readonly check_out: number
}

const clash = (a: PlannedStay, b: PlannedStay, turnaround: number): boolean => a.check_in < b.check_out + turnaround && b.check_in < a.check_out + turnaround
const sameGroup = (a: PlannedStay, b: PlannedStay): boolean => a.share_group !== null && a.share_group === b.share_group

function roomViolations(room: AllocRoom, stays: readonly PlannedStay[], now: number): RuleViolation[] {
  const turnaround = room.turnaround_min * MINUTE
  return stays.flatMap((stay): RuleViolation[] => {
    if (room.out_of_service) return [{ guest_id: stay.guest_id, rule: 'out_of_service' }]
    if (room.housekeeping_status !== 'clean' && now + turnaround > stay.check_in) return [{ guest_id: stay.guest_id, rule: 'not_ready' }]
    const together = stays.filter((other) => other !== stay && clash(stay, other, turnaround))
    if (together.some((other) => !sameGroup(stay, other))) return [{ guest_id: stay.guest_id, rule: 'shared_outside_group' }]
    return together.length + 1 > room.capacity ? [{ guest_id: stay.guest_id, rule: 'over_capacity' }] : []
  })
}

/** Every hard rule a plan breaks (FR-RA-01, FR-RA-03), checked guest by guest. */
export function hardRuleViolations(input: AllocationInput, plan: AllocationPlan): RuleViolation[] {
  const rooms = new Map(input.rooms.map((room) => [room.id, room]))
  const seen = new Set<string>()
  const byRoom = new Map<string, PlannedStay[]>()
  const violations: RuleViolation[] = []
  for (const occupant of input.occupants) byRoom.set(occupant.room_id, [...(byRoom.get(occupant.room_id) ?? []), occupant])
  for (const line of plan.lines) {
    if (seen.has(line.guest.id)) violations.push({ guest_id: line.guest.id, rule: 'placed_twice' })
    seen.add(line.guest.id)
    if (!line.room) continue
    if (!rooms.has(line.room.id)) violations.push({ guest_id: line.guest.id, rule: 'unknown_room' })
    const stay = { guest_id: line.guest.id, share_group: line.guest.share_group, check_in: line.guest.check_in, check_out: line.guest.check_out }
    byRoom.set(line.room.id, [...(byRoom.get(line.room.id) ?? []), stay])
  }
  const planned = new Set(plan.lines.map((line) => line.guest.id))
  for (const [roomId, stays] of byRoom) {
    const room = rooms.get(roomId)
    if (room) violations.push(...roomViolations(room, stays, input.now).filter((violation) => planned.has(violation.guest_id)))
  }
  return violations
}
