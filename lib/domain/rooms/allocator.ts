// The room allocator (FR-RA-01…04, 02-TRD.md §3.4). Guests become room groups (one guest, or a
// coordinator's share group). Delegations are taken by VIP rank, then size; each group gets the
// feasible room that scores best for it, the principal first so the entourage can be placed near
// them. Pairwise swaps then raise the total score. Rooms already taken are never touched.
// Deterministic for a given input; pure. A naive "first free room" baseline is kept for the eval.
import { type AllocRoom, type Occupant, type RoomBlocker, type StayRequest, BLOCKER_TEXT, roomBlocker } from './rules'
import { type AllocGuest, type MatchLevel, type PreferenceResult, type ScoreContext, guestPreferences, headline, matchLevel, satisfaction, targetTier } from './score'

export interface AllocationInput {
  readonly rooms: readonly AllocRoom[]
  /** Stays already in place (planned or checked in); a plan never moves them. */
  readonly occupants: readonly Occupant[]
  /** Rooms of guests already placed (guest id → room id), e.g. a principal placed earlier. */
  readonly placed: ReadonlyMap<string, string>
  readonly guests: readonly AllocGuest[]
  readonly now: number
  /** Swap passes for the local search (0 turns it off). */
  readonly passes?: number
}

export interface PlanLine {
  readonly guest: AllocGuest
  readonly room: AllocRoom | null
  readonly preferences: PreferenceResult[]
  /** Weighted share of this guest's preferences met (0…1). */
  readonly score: number
  readonly match: MatchLevel
  readonly why: string
  /** Why no room was found, when `room` is null. */
  readonly blocked: string | null
}

export interface AllocationPlan {
  readonly lines: PlanLine[]
  /** Weighted share of every preference met across the plan (0…1). */
  readonly satisfaction: number
  readonly placed: number
  readonly unplaced: number
}

interface Group {
  readonly key: string
  readonly members: readonly AllocGuest[]
  readonly request: StayRequest
  readonly order: readonly (string | number)[]
}

type Assignment = ReadonlyMap<string, string>

const DEFAULT_PASSES = 3
const EPSILON = 1e-9
const NO_RANK = 99

function buildGroups(guests: readonly AllocGuest[]): Group[] {
  const byKey = new Map<string, AllocGuest[]>()
  for (const guest of guests) {
    const key = guest.share_group ? `share:${guest.share_group}` : `guest:${guest.id}`
    byKey.set(key, [...(byKey.get(key) ?? []), guest])
  }
  const sizeOf = new Map<string, number>()
  for (const guest of guests) sizeOf.set(guest.delegation_id, (sizeOf.get(guest.delegation_id) ?? 0) + 1)
  return [...byKey.entries()]
    .map(([key, members]) => {
      const lead = members.find((member) => member.is_principal) ?? members[0]
      const request: StayRequest = {
        guest_ids: members.map((member) => member.id),
        share_group: lead?.share_group ?? null,
        check_in: Math.min(...members.map((member) => member.check_in)),
        check_out: Math.max(...members.map((member) => member.check_out)),
      }
      const order = [lead?.rank ?? NO_RANK, -(sizeOf.get(lead?.delegation_id ?? '') ?? 0), lead?.delegation_id ?? '', lead?.is_principal ? 0 : 1, lead?.name ?? '', key]
      return { key, members, request, order }
    })
    .sort((a, b) => compareTuples(a.order, b.order))
}

function compareTuples(a: readonly (string | number)[], b: readonly (string | number)[]): number {
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] ?? 0
    const right = b[index] ?? 0
    if (left === right) continue
    return typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right))
  }
  return 0
}

const asOccupants = (group: Group, roomId: string): Occupant[] =>
  group.members.map((member) => ({ room_id: roomId, guest_id: member.id, share_group: group.request.share_group, check_in: group.request.check_in, check_out: group.request.check_out }))

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const item of items) grouped.set(keyOf(item), [...(grouped.get(keyOf(item)) ?? []), item])
  return grouped
}

/** Group key → the other groups whose score depends on where it is (their principal is in it). */
function dependentsOf(groups: readonly Group[], groupOfGuest: ReadonlyMap<string, string>): Map<string, string[]> {
  const dependents = new Map<string, Set<string>>()
  for (const group of groups) {
    for (const member of group.members) {
      const principalGroup = member.principal_id ? groupOfGuest.get(member.principal_id) : undefined
      if (principalGroup && principalGroup !== group.key) dependents.set(principalGroup, new Set([...(dependents.get(principalGroup) ?? []), group.key]))
    }
  }
  return new Map([...dependents].map(([key, keys]) => [key, [...keys]]))
}

class Planner {
  private readonly roomById: Map<string, AllocRoom>
  private readonly groupByKey: Map<string, Group>
  private readonly groupOfGuest: Map<string, string>
  private readonly dependents: Map<string, string[]>
  private readonly fixedByRoom: Map<string, Occupant[]>
  private readonly lowestFloor: number

  constructor(private readonly input: AllocationInput, private readonly groups: readonly Group[]) {
    this.roomById = new Map(input.rooms.map((room) => [room.id, room]))
    this.groupByKey = new Map(groups.map((group) => [group.key, group]))
    this.groupOfGuest = new Map(groups.flatMap((group) => group.members.map((member) => [member.id, group.key] as const)))
    this.dependents = dependentsOf(groups, this.groupOfGuest)
    this.fixedByRoom = groupBy(input.occupants, (occupant) => occupant.room_id)
    this.lowestFloor = Math.min(...input.rooms.map((room) => room.floor))
  }

  /** Scoring context where group `key` is in room `roomOf(key)`. */
  context(roomOf: (key: string) => string | undefined): ScoreContext {
    return {
      lowest_floor: this.lowestFloor,
      principal_room: (principalId) => {
        const key = this.groupOfGuest.get(principalId)
        const roomId = (key ? roomOf(key) : undefined) ?? this.input.placed.get(principalId)
        return roomId ? this.roomById.get(roomId) : undefined
      },
    }
  }

  contextOf(assignment: Assignment): ScoreContext {
    return this.context((key) => assignment.get(key))
  }

  /** Room id → everyone in it: stays already in place plus the planned groups, except `skip`. */
  occupancy(assignment: Assignment, skip: ReadonlySet<string>): Map<string, Occupant[]> {
    const planned = [...assignment].flatMap(([key, roomId]) => {
      const group = this.groupByKey.get(key)
      return group && !skip.has(key) ? asOccupants(group, roomId) : []
    })
    return groupBy([...this.input.occupants, ...planned], (occupant) => occupant.room_id)
  }

  private occupantsIn(roomId: string, keysByRoom: ReadonlyMap<string, string[]>, skip: ReadonlySet<string>): Occupant[] {
    const planned = (keysByRoom.get(roomId) ?? []).flatMap((key) => {
      const group = this.groupByKey.get(key)
      return group && !skip.has(key) ? asOccupants(group, roomId) : []
    })
    return [...(this.fixedByRoom.get(roomId) ?? []), ...planned]
  }

  groupScore(group: Group, room: AllocRoom, context: ScoreContext): number {
    return group.members.reduce((sum, member) => sum + guestPreferences(member, room, context).reduce((total, result) => total + result.weight * result.score, 0), 0)
  }

  /** The best feasible room for a group, given what is placed so far. */
  bestRoom(group: Group, assignment: Assignment): { room: AllocRoom | null; blocker: RoomBlocker | null } {
    const occupancy = this.occupancy(assignment, new Set([group.key]))
    const context = this.contextOf(assignment)
    const wantsTier = group.members.some((member) => targetTier(member) !== null)
    let best: { room: AllocRoom; key: (string | number)[] } | null = null
    const blockers = new Map<RoomBlocker, number>()
    for (const room of this.input.rooms) {
      const blocker = roomBlocker(room, group.request, occupancy.get(room.id) ?? [], this.input.now)
      if (blocker) {
        blockers.set(blocker, (blockers.get(blocker) ?? 0) + 1)
        continue
      }
      // Best score; then the fewest spare beds; guests with no tier wish leave the best rooms free.
      const key = [-this.groupScore(group, room, context), room.capacity - group.members.length, wantsTier ? 0 : -room.tier, room.number]
      if (!best || compareTuples(key, best.key) < 0) best = { room, key }
    }
    const blocker = [...blockers.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    return { room: best?.room ?? null, blocker }
  }

  /**
   * Pairwise room swaps between planned groups while the total score improves. A swap only moves
   * the two groups and the groups placed near them, so only those are re-scored.
   */
  improve(start: Assignment, passes: number): Assignment {
    let assignment = start
    let keysByRoom = groupBy([...assignment.keys()], (key) => assignment.get(key) ?? '')
    for (let pass = 0; pass < passes; pass += 1) {
      let improved = false
      const keys = [...assignment.keys()]
      for (let i = 0; i < keys.length; i += 1) {
        for (let j = i + 1; j < keys.length; j += 1) {
          const a = keys[i] ?? ''
          const b = keys[j] ?? ''
          if (!this.canSwap(assignment, keysByRoom, a, b) || this.swapGain(assignment, a, b) <= EPSILON) continue
          const [roomA, roomB] = [assignment.get(a) ?? '', assignment.get(b) ?? '']
          assignment = new Map(assignment).set(a, roomB).set(b, roomA)
          const current = assignment
          keysByRoom = groupBy([...current.keys()], (key) => current.get(key) ?? '')
          improved = true
        }
      }
      if (!improved) break
    }
    return assignment
  }

  /** Whether a and b can trade rooms under the hard rules. */
  private canSwap(assignment: Assignment, keysByRoom: ReadonlyMap<string, string[]>, a: string, b: string): boolean {
    const roomA = assignment.get(a)
    const roomB = assignment.get(b)
    if (!roomA || !roomB || roomA === roomB) return false
    const groupA = this.groupByKey.get(a)
    const groupB = this.groupByKey.get(b)
    const targetA = this.roomById.get(roomB)
    const targetB = this.roomById.get(roomA)
    if (!groupA || !groupB || !targetA || !targetB) return false
    const skip = new Set([a, b])
    if (roomBlocker(targetA, groupA.request, this.occupantsIn(roomB, keysByRoom, skip), this.input.now)) return false
    return roomBlocker(targetB, groupB.request, this.occupantsIn(roomA, keysByRoom, skip), this.input.now) === null
  }

  /** How much the total score changes if a and b trade rooms. */
  private swapGain(assignment: Assignment, a: string, b: string): number {
    const swapped = (key: string) => assignment.get(key === a ? b : key === b ? a : key)
    const before = this.contextOf(assignment)
    const after = this.context(swapped)
    const affected = new Set([a, b, ...(this.dependents.get(a) ?? []), ...(this.dependents.get(b) ?? [])])
    let gain = 0
    for (const key of affected) {
      const group = this.groupByKey.get(key)
      const from = this.roomById.get(assignment.get(key) ?? '')
      const to = this.roomById.get(swapped(key) ?? '')
      if (group && from) gain -= this.groupScore(group, from, before)
      if (group && to) gain += this.groupScore(group, to, after)
    }
    return gain
  }

  lines(assignment: Assignment, blocked: ReadonlyMap<string, RoomBlocker | null>): PlanLine[] {
    const context = this.contextOf(assignment)
    return this.groups.flatMap((group) =>
      [...group.members]
        .sort((a, b) => Number(b.is_principal) - Number(a.is_principal) || a.name.localeCompare(b.name))
        .map((guest) => {
          const room = this.roomById.get(assignment.get(group.key) ?? '') ?? null
          if (!room) {
            const reason = blocked.get(group.key)
            return { guest, room, preferences: [], score: 0, match: 'Low' as const, why: 'No room found', blocked: reason ? BLOCKER_TEXT[reason] : 'No room is free for these dates.' }
          }
          const preferences = guestPreferences(guest, room, context)
          const score = satisfaction(preferences)
          return { guest, room, preferences, score, match: matchLevel(score), why: headline(preferences), blocked: null }
        }),
    )
  }
}

function summarise(lines: PlanLine[]): AllocationPlan {
  const weights = lines.flatMap((line) => (line.room ? line.preferences : [])).reduce(
    (sum, result) => ({ earned: sum.earned + result.weight * result.score, possible: sum.possible + result.weight }),
    { earned: 0, possible: 0 },
  )
  const placed = lines.filter((line) => line.room).length
  return { lines, satisfaction: weights.possible === 0 ? 1 : weights.earned / weights.possible, placed, unplaced: lines.length - placed }
}

/** The plan for `guests`: greedy by rank, then local search. */
export function allocate(input: AllocationInput): AllocationPlan {
  const groups = buildGroups(input.guests)
  const planner = new Planner(input, groups)
  let assignment = new Map<string, string>()
  const blocked = new Map<string, RoomBlocker | null>()
  for (const group of groups) {
    const { room, blocker } = planner.bestRoom(group, assignment)
    if (room) assignment = new Map(assignment).set(group.key, room.id)
    else blocked.set(group.key, blocker)
  }
  const improved = planner.improve(assignment, input.passes ?? DEFAULT_PASSES)
  return summarise(planner.lines(improved, blocked))
}

/** Evaluation baseline: each group, in arrival order, takes the first free room by number. */
export function allocateFirstFree(input: AllocationInput): AllocationPlan {
  const groups = buildGroups(input.guests)
  const planner = new Planner(input, groups)
  const rooms = [...input.rooms].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
  let assignment = new Map<string, string>()
  const blocked = new Map<string, RoomBlocker | null>()
  for (const group of groups) {
    const occupancy = planner.occupancy(assignment, new Set([group.key]))
    const room = rooms.find((candidate) => roomBlocker(candidate, group.request, occupancy.get(candidate.id) ?? [], input.now) === null)
    if (room) assignment = new Map(assignment).set(group.key, room.id)
    else blocked.set(group.key, null)
  }
  return summarise(planner.lines(assignment, blocked))
}
