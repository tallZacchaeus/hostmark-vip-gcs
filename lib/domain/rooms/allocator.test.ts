import { describe, expect, it } from 'vitest'
import { allocate, allocateFirstFree } from './allocator'
import { type AllocRoom, type Occupant, roomBlocker } from './rules'
import { type AllocGuest, guestPreferences, roomDistance, satisfaction } from './score'

const HOUR = 60 * 60_000
const NOW = Date.UTC(2026, 10, 20, 8)
const IN = NOW + 6 * HOUR
const OUT = NOW + 72 * HOUR

/** Floors 1–3, West rooms at positions 1–3 and East at 4–6; floor 3 suites (tier 1), floor 1 tier 3. */
function venue(): AllocRoom[] {
  return [1, 2, 3].flatMap((floor) =>
    [1, 2, 3, 4, 5, 6].map((position) => ({
      id: `r${floor}0${position}`,
      number: `${floor}0${position}`,
      floor,
      wing: position <= 3 ? 'West' : 'East',
      position,
      type_name: floor === 3 ? 'Suite' : 'Standard',
      tier: 4 - floor,
      capacity: 2,
      is_accessible: floor === 1 && position === 1,
      out_of_service: false,
      housekeeping_status: 'clean' as const,
      turnaround_min: 60,
    })),
  )
}

const guest = (overrides: Partial<AllocGuest> & Pick<AllocGuest, 'id'>): AllocGuest => ({
  name: overrides.id,
  role_label: 'Principal',
  delegation_id: 'd1',
  delegation_name: 'Delegation',
  is_principal: true,
  principal_id: null,
  rank: 1,
  preferred_tier: null,
  proximity: 'normal',
  share_group: null,
  needs_accessible: false,
  wants_ground_floor: false,
  check_in: IN,
  check_out: OUT,
  ...overrides,
})

const member = (id: string, principal: string, overrides: Partial<AllocGuest> = {}): AllocGuest =>
  guest({ id, role_label: 'Assistant', is_principal: false, principal_id: principal, rank: null, ...overrides })

const rooms = venue()
const room = (number: string): AllocRoom => rooms.find((item) => item.number === number) as AllocRoom
const request = { guest_ids: ['g'], share_group: null, check_in: IN, check_out: OUT }

describe('roomBlocker', () => {
  it('refuses rooms out of service, or not cleanable before arrival', () => {
    expect(roomBlocker({ ...room('101'), out_of_service: true }, request, [], NOW)).toBe('out_of_service')
    expect(roomBlocker({ ...room('101'), housekeeping_status: 'needs_cleaning' }, { ...request, check_in: NOW + 30 * 60_000 }, [], NOW)).toBe('not_ready')
    expect(roomBlocker({ ...room('101'), housekeeping_status: 'needs_cleaning' }, request, [], NOW)).toBeNull()
    // With the database's estimate (a clean that started earlier), that time decides.
    const beingCleaned = { ...room('101'), housekeeping_status: 'cleaning' as const, ready_at: NOW + 20 * 60_000 }
    expect(roomBlocker(beingCleaned, { ...request, check_in: NOW + 30 * 60_000 }, [], NOW)).toBeNull()
    expect(roomBlocker(beingCleaned, { ...request, check_in: NOW + 10 * 60_000 }, [], NOW)).toBe('not_ready')
  })

  it('keeps a room for its stay plus cleaning time, and lets only a share group share it', () => {
    const stay: Occupant = { room_id: 'r101', guest_id: 'x', share_group: null, check_in: NOW - 24 * HOUR, check_out: IN - 30 * 60_000 }
    expect(roomBlocker(room('101'), request, [stay], NOW)).toBe('occupied')
    expect(roomBlocker(room('101'), request, [{ ...stay, check_out: IN - 2 * HOUR }], NOW)).toBeNull()
    const partner: Occupant = { room_id: 'r101', guest_id: 'x', share_group: 'okafor', check_in: IN, check_out: OUT }
    expect(roomBlocker(room('101'), { ...request, share_group: 'okafor' }, [partner], NOW)).toBeNull()
    expect(roomBlocker(room('101'), { ...request, guest_ids: ['a', 'b'], share_group: 'okafor' }, [partner], NOW)).toBe('capacity')
  })
})

describe('preferences', () => {
  const context = { lowest_floor: 1, principal_room: () => room('302') }

  it('scores tier, accessibility and the ground floor, with reasons', () => {
    const principal = guest({ id: 'p', rank: 1 })
    expect(guestPreferences(principal, room('301'), context)).toMatchObject([{ code: 'tier', status: 'met', text: 'Tier match' }])
    expect(guestPreferences(principal, room('201'), context)[0]).toMatchObject({ status: 'partly', score: 0.5 })
    const needs = guest({ id: 'n', rank: null, is_principal: false, needs_accessible: true, wants_ground_floor: true })
    const results = guestPreferences(needs, room('201'), { ...context, principal_room: () => undefined })
    expect(results.map((result) => [result.code, result.status])).toEqual([
      ['accessible', 'missed'],
      ['ground_floor', 'partly'],
    ])
    expect(satisfaction(guestPreferences(needs, room('101'), { ...context, principal_room: () => undefined }))).toBe(1)
  })

  it('measures how near a member is to the principal', () => {
    expect(roomDistance(room('302'), room('302'))).toBe(0)
    expect(roomDistance(room('302'), room('303'))).toBe(1)
    expect(roomDistance(room('302'), room('305'))).toBe(7)
    const near = guestPreferences(member('m', 'p'), room('303'), context)[0]
    expect(near).toMatchObject({ code: 'proximity', status: 'met', text: 'Next to the principal (room 302)' })
    const far = guestPreferences(member('m', 'p'), room('104'), context)[0]
    expect(far?.text).toBe('104 is on floor 1 and the principal is in 302 on floor 3.')
  })
})

describe('allocate', () => {
  const input = (guests: AllocGuest[], occupants: Occupant[] = []) => ({ rooms, occupants, placed: new Map<string, string>(), guests, now: NOW })

  it('gives principals their tier and seats the entourage next to them', () => {
    const plan = allocate(input([guest({ id: 'p1' }), member('m1', 'p1', { proximity: 'high' }), member('m2', 'p1')]))

    const roomOf = (id: string) => plan.lines.find((line) => line.guest.id === id)?.room
    expect(roomOf('p1')?.tier).toBe(1)
    expect(roomOf('m1')?.floor).toBe(3)
    expect(roomOf('m1')?.wing).toBe(roomOf('p1')?.wing)
    expect(plan.unplaced).toBe(0)
    expect(plan.satisfaction).toBeGreaterThan(0.9)
  })

  it('puts a share group in one room and never touches rooms already taken', () => {
    const taken: Occupant[] = rooms.filter((item) => item.floor === 3).map((item) => ({ room_id: item.id, guest_id: `x${item.number}`, share_group: null, check_in: IN, check_out: OUT }))
    const plan = allocate(input([guest({ id: 'p1', share_group: 'okafor' }), member('m1', 'p1', { share_group: 'okafor' })], taken))

    const [first, second] = plan.lines
    expect(first?.room?.id).toBe(second?.room?.id)
    expect(first?.room?.floor).not.toBe(3)
    expect(second?.why).toBe('Shares with principal')
  })

  it('explains a guest it cannot place', () => {
    const full: Occupant[] = rooms.map((item) => ({ room_id: item.id, guest_id: `x${item.number}`, share_group: null, check_in: IN, check_out: OUT }))
    const plan = allocate(input([guest({ id: 'p1' })], full))

    expect(plan.lines[0]).toMatchObject({ room: null, blocked: 'Someone else is in the room at that time.' })
    expect(plan.unplaced).toBe(1)
  })

  it('serves higher ranks first and is deterministic', () => {
    const guests = [guest({ id: 'low', rank: 3, delegation_id: 'd3' }), guest({ id: 'top', rank: 1, delegation_id: 'd1' })]
    const scarce = rooms.filter((item) => item.number !== '301' && item.floor === 3).map((item) => ({ room_id: item.id, guest_id: `x${item.number}`, share_group: null, check_in: IN, check_out: OUT }))

    const plan = allocate(input(guests, scarce))

    expect(plan.lines.find((line) => line.guest.id === 'top')?.room?.number).toBe('301')
    expect(allocate(input(guests, scarce))).toEqual(plan)
  })

  it('beats the first-free-room baseline on preferences', () => {
    const guests = [
      guest({ id: 'p1', rank: 1, delegation_id: 'd1' }),
      member('m1', 'p1', { delegation_id: 'd1', proximity: 'high' }),
      guest({ id: 'p2', rank: 3, delegation_id: 'd2', needs_accessible: true, wants_ground_floor: true }),
    ]
    expect(allocate(input(guests)).satisfaction).toBeGreaterThan(allocateFirstFree(input(guests)).satisfaction)
  })
})
