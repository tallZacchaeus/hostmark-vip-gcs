import { describe, expect, it } from 'vitest'
import { type AllocationPlan, allocate } from '@/lib/domain/rooms/allocator'
import { buildInstance, hardRuleViolations } from './allocation'

const VENUE = { name: 'venue', floors: 6, delegations: 30, now_offset_h: -48 }

describe('allocation eval instances', () => {
  it('builds the same venue and guests for the same seed', () => {
    const first = buildInstance(VENUE, 7)
    const again = buildInstance(VENUE, 7)

    expect(first.rooms).toHaveLength(120)
    expect(again.guests).toEqual(first.guests)
    expect(buildInstance(VENUE, 8).guests).not.toEqual(first.guests)
  })
})

describe('hardRuleViolations', () => {
  const input = buildInstance(VENUE, 7)
  const clean = input.rooms.find((room) => room.housekeeping_status === 'clean' && !room.out_of_service && room.capacity === 1)
  const [first, second] = input.guests.filter((guest) => guest.share_group === null)
  const planWith = (lines: AllocationPlan['lines']): AllocationPlan => ({ lines, satisfaction: 0, placed: lines.length, unplaced: 0 })
  const line = (guest: NonNullable<typeof first>, room = clean ?? null) => ({ guest, room, preferences: [], score: 0, match: 'Low' as const, why: '', blocked: null })

  it('finds no violation in what the allocator plans', () => {
    expect(hardRuleViolations(input, allocate(input))).toEqual([])
  })

  it('catches two strangers in one single room at the same time', () => {
    if (!first || !second || !clean) throw new Error('fixture')
    const overlapping = { ...second, check_in: first.check_in, check_out: first.check_out }

    expect(hardRuleViolations(input, planWith([line(first), line(overlapping)]))).toContainEqual({ guest_id: first.id, rule: 'shared_outside_group' })
  })

  it('catches a room out of service and a dirty room that cannot be ready in time', () => {
    if (!first || !clean) throw new Error('fixture')
    const broken = { ...clean, id: 'broken', out_of_service: true }
    const dirty = { ...clean, id: 'dirty', housekeeping_status: 'needs_cleaning' as const }
    const early = { ...first, check_in: input.now + 10 * 60_000 }
    const world = { ...input, rooms: [...input.rooms, broken, dirty] }

    expect(hardRuleViolations(world, planWith([line(first, broken)]))).toEqual([{ guest_id: first.id, rule: 'out_of_service' }])
    expect(hardRuleViolations(world, planWith([line(early, dirty)]))).toEqual([{ guest_id: first.id, rule: 'not_ready' }])
  })

  it('catches a guest placed twice', () => {
    if (!first) throw new Error('fixture')
    expect(hardRuleViolations(input, planWith([line(first, null), line(first, null)]))).toEqual([{ guest_id: first.id, rule: 'placed_twice' }])
  })
})
