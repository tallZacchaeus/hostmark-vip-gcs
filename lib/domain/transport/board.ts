// How the arrivals and transport boards classify and lay out rows. Pure.
import type { FlightPhase } from '@/lib/domain/flights/schedule'

export type ArrivalBoardStatus = 'landed' | 'delayed' | 'cancelled' | 'due'

export interface ArrivalStatusInput {
  readonly phase: FlightPhase | null
  readonly delay_minutes: number | null
  /** arrivals.status: 'expected' | 'arrived' | 'cancelled' */
  readonly arrival_status: string
}

/** The board's status filter (Figma: Landed / Delayed / Cancelled / Due). */
export function arrivalStatus(input: ArrivalStatusInput, delayThresholdMin: number): ArrivalBoardStatus {
  if (input.phase === 'cancelled' || input.phase === 'diverted') return 'cancelled'
  if (input.phase === 'landed' || input.arrival_status === 'arrived') return 'landed'
  if (input.delay_minutes !== null && input.delay_minutes >= delayThresholdMin) return 'delayed'
  return 'due'
}

/** The day to show: the one asked for, today if anything happens today, else the next day that has something, else today. */
export function pickDay(requested: string | undefined, today: string, days: readonly string[]): string {
  if (requested) return requested
  if (days.includes(today)) return today
  return [...days].sort().find((day) => day > today) ?? today
}

export interface BoardRange {
  readonly start: number
  readonly end: number
}

const HOUR = 60 * 60_000

/**
 * The timeline's span: whole hours covering every block, at least `minHours` wide and starting
 * no later than `dayStart` + 8 h (the board opens on the working day, not on the first trip).
 */
export function boardRange(dayStart: number, blocks: readonly BoardRange[], minHours = 12): BoardRange {
  const defaultStart = dayStart + 8 * HOUR
  const earliest = Math.min(defaultStart, ...blocks.map((block) => block.start))
  const start = Math.floor(earliest / HOUR) * HOUR
  const latest = Math.max(start + minHours * HOUR, ...blocks.map((block) => block.end))
  return { start, end: Math.ceil(latest / HOUR) * HOUR }
}

/** Where a block sits on the timeline, as percentages of its width. */
export function placeBlock(range: BoardRange, block: BoardRange): { left: number; width: number } {
  const span = range.end - range.start
  const left = Math.max(0, ((block.start - range.start) / span) * 100)
  const right = Math.min(100, ((block.end - range.start) / span) * 100)
  return { left, width: Math.max(0, right - left) }
}
