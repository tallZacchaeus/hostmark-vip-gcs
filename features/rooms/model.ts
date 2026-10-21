// How the room grid reads (Figma "Rooms"): status labels and icons, the building laid out from the
// venue's own wings, floors and positions, and the filters. Pure.
import type { IconName } from '@/components/ui/Icon'
import type { Tone } from '@/components/ui/Status'
import type { BoardRoom, RoomBoardStatus, RoomsBoard } from '@/lib/repositories/rooms-board'

export type { BoardRoom, BoardStay, RoomBoardStatus, RoomsBoard } from '@/lib/repositories/rooms-board'
export { ROOM_STATUSES } from '@/lib/repositories/rooms-board'

export const STATUS_META: Readonly<Record<RoomBoardStatus, { readonly label: string; readonly icon: IconName; readonly tone: Tone }>> = {
  ready: { label: 'Ready', icon: 'check', tone: 'success' },
  proposed: { label: 'Proposed', icon: 'sparkle', tone: 'info' },
  reserved: { label: 'Reserved', icon: 'calendar', tone: 'info' },
  occupied: { label: 'Occupied', icon: 'user', tone: 'info' },
  'needs-cleaning': { label: 'Needs cleaning', icon: 'brush', tone: 'warning' },
  cleaning: { label: 'Cleaning', icon: 'loader', tone: 'warning' },
  'out-of-service': { label: 'Out of service', icon: 'minus', tone: 'neutral' },
}

export interface WingLayout {
  readonly name: string
  /** Corridor positions in this wing, left to right. */
  readonly positions: number[]
  /** floor → position → room */
  readonly cells: ReadonlyMap<number, ReadonlyMap<number, BoardRoom>>
}

export interface BuildingLayout {
  /** Top floor first, as in an elevation drawing. */
  readonly floors: number[]
  readonly wings: WingLayout[]
}

/** Wings in corridor order (by their first position), floors from the top. */
export function buildingLayout(rooms: readonly BoardRoom[]): BuildingLayout {
  const floors = [...new Set(rooms.map((room) => room.floor))].sort((a, b) => b - a)
  const byWing = new Map<string, BoardRoom[]>()
  for (const room of rooms) byWing.set(room.wing, [...(byWing.get(room.wing) ?? []), room])
  const wings = [...byWing.entries()]
    .map(([name, wingRooms]) => {
      const positions = [...new Set(wingRooms.map((room) => room.position))].sort((a, b) => a - b)
      const cells = new Map<number, Map<number, BoardRoom>>()
      for (const room of wingRooms) {
        const floor = cells.get(room.floor) ?? new Map<number, BoardRoom>()
        floor.set(room.position, room)
        cells.set(room.floor, floor)
      }
      return { name, positions, cells }
    })
    .sort((a, b) => (a.positions[0] ?? 0) - (b.positions[0] ?? 0) || a.name.localeCompare(b.name))
  return { floors, wings }
}

export interface RoomFilters {
  readonly wing: string
  readonly floor: string
  readonly status: RoomBoardStatus | 'all'
  readonly query: string
}

export function matchesFilters(room: BoardRoom, filters: RoomFilters): boolean {
  if (filters.wing !== 'all' && room.wing !== filters.wing) return false
  if (filters.floor !== 'all' && String(room.floor) !== filters.floor) return false
  if (filters.status !== 'all' && room.status !== filters.status) return false
  const needle = filters.query.trim().toLowerCase()
  if (!needle) return true
  const names = [...room.stays.map((stay) => stay.name), ...room.suggestions.map((suggestion) => suggestion.name)]
  return room.number.toLowerCase().includes(needle) || names.some((name) => name.toLowerCase().includes(needle))
}

/** "Suite · East wing · Floor 4" */
export const roomLine = (room: Pick<BoardRoom, 'type_name' | 'wing' | 'floor'>): string => `${room.type_name} · ${room.wing} wing · Floor ${room.floor}`

const EMPTY_ROOM_NOTES: Readonly<Partial<Record<RoomBoardStatus, string>>> = {
  'out-of-service': 'Out of service. The allocator will not use this room.',
  'needs-cleaning': 'Waiting for housekeeping. Offered to guests only if it can be cleaned before they arrive.',
  cleaning: 'Housekeeping is cleaning this room now.',
}

/** What the inspector says about a room: who is in it, who it is kept or proposed for, or its state. */
export function inspectorText(room: BoardRoom, when: (iso: string) => string): string {
  const names = room.stays.map((stay) => stay.name).join(', ')
  const first = room.stays[0]
  if (first && room.stays.some((stay) => stay.status === 'checked_in')) return `Checked in: ${names}. Leaves ${when(first.check_out)}.`
  if (first) return `Reserved for ${names}, from ${when(first.check_in)} to ${when(first.check_out)}.`
  if (room.suggestions.length > 0) return `Proposed for ${room.suggestions.map((item) => item.name).join(', ')}. Open the plan to decide.`
  return EMPTY_ROOM_NOTES[room.status] ?? 'Ready and free. The allocator can use this room.'
}

/** "120 rooms · 78 ready" */
export function headerLine(board: RoomsBoard): string {
  return `${board.rooms.length} rooms · ${board.counts.ready} ready${board.unplaced ? ` · ${board.unplaced} ${board.unplaced === 1 ? 'guest needs' : 'guests need'} a room` : ''}`
}
