// The transport board's layout and wording (Figma "Transport"): where blocks sit on the timeline,
// the hour ticks, shaded off-shift time and driver/trip labels. Pure.
import type { Tone } from '@/components/ui/Status'
import { type BoardRange, placeBlock } from '@/lib/domain/transport/board'
import type { BoardDriver, BoardTrip, DriverState, TripState } from '@/lib/repositories/transport'

export type { BoardDecision, BoardDriver, BoardTrip, TransportBoard } from '@/lib/repositories/transport'

const HOUR = 60 * 60_000
/** Up to ~8 labels across the board. */
const MAX_TICKS = 8

export interface Placement {
  readonly left: number
  readonly width: number
}

export const toRange = (range: { readonly start: string; readonly end: string }): BoardRange => ({
  start: new Date(range.start).getTime(),
  end: new Date(range.end).getTime(),
})

export function placeTrip(range: BoardRange, trip: Pick<BoardTrip, 'window_start' | 'window_end'>): Placement {
  return placeBlock(range, { start: new Date(trip.window_start).getTime(), end: new Date(trip.window_end).getTime() })
}

/** Hour marks every 1, 2 or 3 hours so that at most MAX_TICKS show. */
export function ticks(range: BoardRange): { readonly at: number; readonly left: number }[] {
  const hours = (range.end - range.start) / HOUR
  const step = [1, 2, 3, 4].find((candidate) => hours / candidate <= MAX_TICKS - 1) ?? 4
  const marks: { at: number; left: number }[] = []
  for (let at = range.start; at <= range.end; at += step * HOUR) {
    marks.push({ at, left: ((at - range.start) / (range.end - range.start)) * 100 })
  }
  return marks
}

/** Where "now" sits, or null when it is outside the board. */
export function nowPosition(range: BoardRange, now: Date | null): number | null {
  if (!now) return null
  const at = now.getTime()
  return at < range.start || at > range.end ? null : ((at - range.start) / (range.end - range.start)) * 100
}

/** Time outside the driver's shifts, as shaded spans. A driver with no shift that day is all shaded. */
export function offShiftSpans(range: BoardRange, shifts: BoardDriver['shifts']): Placement[] {
  if (shifts.length === 0) return [{ left: 0, width: 100 }]
  const sorted = [...shifts].map((shift) => ({ start: new Date(shift.starts_at).getTime(), end: new Date(shift.ends_at).getTime() })).sort((a, b) => a.start - b.start)
  const gaps: { start: number; end: number }[] = []
  let cursor = range.start
  for (const shift of sorted) {
    if (shift.start > cursor) gaps.push({ start: cursor, end: shift.start })
    cursor = Math.max(cursor, shift.end)
  }
  if (cursor < range.end) gaps.push({ start: cursor, end: range.end })
  return gaps.map((gap) => placeBlock(range, gap)).filter((span) => span.width > 0)
}

export const TRIP_CLASSES: Readonly<Record<TripState, string>> = {
  done: 'is-done',
  progress: 'is-progress',
  planned: 'is-planned',
  suggested: 'is-ghost',
  unassigned: 'is-unassigned',
}

export const TRIP_LABELS: Readonly<Record<TripState, { readonly label: string; readonly tone: Tone }>> = {
  done: { label: 'Done', tone: 'neutral' },
  progress: { label: 'In progress', tone: 'info' },
  planned: { label: 'Assigned', tone: 'success' },
  suggested: { label: 'Suggested', tone: 'warning' },
  unassigned: { label: 'Needs a driver', tone: 'error' },
}

export const DRIVER_STATES: Readonly<Record<DriverState, { readonly label: string; readonly tone: Tone }>> = {
  on_trip: { label: 'On a trip', tone: 'info' },
  available: { label: 'Available', tone: 'success' },
  off_shift: { label: 'Off shift', tone: 'neutral' },
  inactive: { label: 'Inactive', tone: 'neutral' },
}

/** "Prado SUV · 6 seats" */
export function vehicleLine(driver: Pick<BoardDriver, 'vehicle_label' | 'vehicle_capacity'>): string {
  const seats = `${driver.vehicle_capacity} ${driver.vehicle_capacity === 1 ? 'seat' : 'seats'}`
  return driver.vehicle_label ? `${driver.vehicle_label} · ${seats}` : seats
}
