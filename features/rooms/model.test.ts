import { describe, expect, it } from 'vitest'
import type { BoardRoom, BoardStay, RoomsBoard } from '@/lib/repositories/rooms-board'
import { buildingLayout, headerLine, inspectorText, matchesFilters, roomLine } from './model'
import { roomChoices } from './MoveDialog'

const room = (overrides: Partial<BoardRoom>): BoardRoom => ({
  id: 'r-101',
  number: '101',
  floor: 1,
  wing: 'West',
  position: 1,
  type_name: 'Standard',
  tier: 1,
  capacity: 2,
  is_accessible: false,
  status: 'ready',
  stays: [],
  suggestions: [],
  ...overrides,
})

const stay = (overrides: Partial<BoardStay>): BoardStay => ({
  assignment_id: 'a-1',
  guest_id: 'g-1',
  name: 'Bishop Augustine Okafor',
  role: 'Principal',
  delegation_name: 'Okafor delegation',
  principal_guest_id: 'g-1',
  status: 'planned',
  check_in: '2026-10-28T13:00:00.000Z',
  check_out: '2026-10-31T11:00:00.000Z',
  is_manual_override: false,
  ...overrides,
})

const when = (iso: string) => iso.slice(5, 10)
const ALL = { wing: 'all', floor: 'all', status: 'all', query: '' } as const

describe('buildingLayout', () => {
  it('orders wings along the corridor and floors from the top', () => {
    const layout = buildingLayout([
      room({ id: 'e1', number: '104', wing: 'East', position: 4 }),
      room({ id: 'w1', number: '101', wing: 'West', position: 1 }),
      room({ id: 'w3', number: '301', wing: 'West', position: 1, floor: 3 }),
      room({ id: 'w2', number: '102', wing: 'West', position: 2 }),
    ])

    expect(layout.floors).toEqual([3, 1])
    expect(layout.wings.map((wing) => wing.name)).toEqual(['West', 'East'])
    expect(layout.wings[0]?.positions).toEqual([1, 2])
    expect(layout.wings[0]?.cells.get(3)?.get(1)?.number).toBe('301')
  })
})

describe('matchesFilters', () => {
  const reserved = room({ number: '204', wing: 'East', floor: 2, status: 'reserved', stays: [stay({})] })

  it('matches on wing, floor and status together', () => {
    expect(matchesFilters(reserved, { ...ALL, wing: 'East', floor: '2', status: 'reserved' })).toBe(true)
    expect(matchesFilters(reserved, { ...ALL, wing: 'West' })).toBe(false)
    expect(matchesFilters(reserved, { ...ALL, floor: '1' })).toBe(false)
    expect(matchesFilters(reserved, { ...ALL, status: 'ready' })).toBe(false)
  })

  it('searches room numbers and guest names, ignoring case', () => {
    expect(matchesFilters(reserved, { ...ALL, query: '20' })).toBe(true)
    expect(matchesFilters(reserved, { ...ALL, query: 'okafor' })).toBe(true)
    expect(matchesFilters(room({ suggestions: [{ proposal_id: 'p', plan_id: null, guest_id: 'g', name: 'Dr Ngozi Eze' }] }), { ...ALL, query: 'ngozi' })).toBe(true)
    expect(matchesFilters(reserved, { ...ALL, query: 'eze' })).toBe(false)
  })
})

describe('inspectorText', () => {
  it('names who is checked in and when they leave', () => {
    expect(inspectorText(room({ status: 'occupied', stays: [stay({ status: 'checked_in' })] }), when)).toBe('Checked in: Bishop Augustine Okafor. Leaves 10-31.')
  })

  it('names who a room is kept for, and who it is proposed for', () => {
    expect(inspectorText(room({ status: 'reserved', stays: [stay({})] }), when)).toBe('Reserved for Bishop Augustine Okafor, from 10-28 to 10-31.')
    expect(inspectorText(room({ status: 'proposed', suggestions: [{ proposal_id: 'p', plan_id: 'pl', guest_id: 'g', name: 'Dr Ngozi Eze' }] }), when)).toBe('Proposed for Dr Ngozi Eze. Open the plan to decide.')
  })

  it('explains empty rooms by their state', () => {
    expect(inspectorText(room({ status: 'out-of-service' }), when)).toMatch(/will not use this room/)
    expect(inspectorText(room({ status: 'needs-cleaning' }), when)).toMatch(/cleaned before they arrive/)
    expect(inspectorText(room({ status: 'cleaning' }), when)).toBe('Housekeeping is cleaning this room now.')
    expect(inspectorText(room({}), when)).toBe('Ready and free. The allocator can use this room.')
  })
})

describe('headerLine and roomLine', () => {
  const counts = { ready: 2, proposed: 0, reserved: 1, occupied: 0, 'needs-cleaning': 0, cleaning: 0, 'out-of-service': 0 }
  const board = (unplaced: number): RoomsBoard => ({ rooms: [room({}), room({ id: 'b' }), room({ id: 'c' })], counts, pending_plan_id: null, unplaced })

  it('counts rooms, ready rooms and guests still waiting', () => {
    expect(headerLine(board(0))).toBe('3 rooms · 2 ready')
    expect(headerLine(board(1))).toBe('3 rooms · 2 ready · 1 guest needs a room')
    expect(headerLine(board(4))).toBe('3 rooms · 2 ready · 4 guests need a room')
  })

  it('describes a room by type, wing and floor', () => {
    expect(roomLine({ type_name: 'Suite', wing: 'East', floor: 3 })).toBe('Suite · East wing · Floor 3')
  })
})

describe('roomChoices', () => {
  it('sorts rooms by number and flags any that are not ready', () => {
    const choices = roomChoices([room({ id: 'b', number: '110', status: 'needs-cleaning' }), room({ id: 'a', number: '102' }), room({ id: 'c', number: '20', floor: 0 })])

    expect(choices.map((choice) => choice.number)).toEqual(['20', '102', '110'])
    expect(choices[2]?.label).toBe('Standard, West F1 (needs cleaning)')
    expect(choices[1]?.label).toBe('Standard, West F1')
  })
})
