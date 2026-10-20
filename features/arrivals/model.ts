// How the arrivals board reads (Figma screen "Arrivals"): badges for flight and pickup, the driver
// cell, filters and hour groups. Pure, so it is tested without rendering.
import type { Tone } from '@/components/ui/Status'
import { PICKUP_STATUS } from '@/features/guests/types'
import { formatDelay, formatTime } from '@/lib/client/format'
import type { ArrivalBoardRow } from '@/lib/repositories/arrivals'

export type { ArrivalBoardRow, ArrivalsBoard } from '@/lib/repositories/arrivals'

export type StatusFilter = 'all' | ArrivalBoardRow['status']
export type WindowFilter = '2h' | '6h' | 'day'

export interface Badge {
  readonly label: string
  readonly tone: Tone
}

const HOUR = 60 * 60_000
const WINDOW_HOURS: Readonly<Record<Exclude<WindowFilter, 'day'>, number>> = { '2h': 2, '6h': 6 }

export function flightBadge(row: ArrivalBoardRow): Badge | null {
  const flight = row.flight
  if (!flight) return null
  if (flight.phase === 'cancelled') return { label: 'Cancelled', tone: 'error' }
  if (flight.phase === 'diverted') return { label: 'Diverted', tone: 'error' }
  if (flight.phase === 'landed') return { label: 'Landed', tone: 'success' }
  if (flight.manual_arrival_at) return { label: 'Time set by hand', tone: 'info' }
  if (row.status === 'delayed') return { label: `Delayed ${formatDelay(flight.delay_minutes ?? 0)}`, tone: 'warning' }
  if (flight.delay_minutes !== null && flight.delay_minutes < 0) return { label: `Early ${formatDelay(flight.delay_minutes).slice(1)}`, tone: 'info' }
  return flight.phase === 'in_air' ? { label: 'In the air', tone: 'info' } : { label: 'On time', tone: 'neutral' }
}

export function pickupBadge(row: ArrivalBoardRow): Badge {
  if (row.pickup) return PICKUP_STATUS[row.pickup.status as keyof typeof PICKUP_STATUS] ?? { label: row.pickup.status, tone: 'neutral' }
  if (row.mode === 'own_transport') return { label: 'Pickup not needed', tone: 'neutral' }
  return { label: row.mode === 'flying' ? 'Waits for landing time' : 'Not planned', tone: 'neutral' }
}

/** The suggestion chip: who is suggested, or that releasing the pickup is. */
export function suggestionLabel(row: ArrivalBoardRow): string | null {
  if (!row.suggestion) return null
  return row.suggestion.kind === 'release_pickup' ? 'Release suggested' : (row.suggestion.driver_names ?? 'Driver suggested')
}

export const needsDriver = (row: ArrivalBoardRow): boolean => row.pickup?.status === 'pending_assignment' && row.drivers.length === 0 && !row.suggestion

/** The landing time before the change, when the flight moved. */
export function previousTime(row: ArrivalBoardRow, timeZone: string): string | null {
  const scheduled = row.flight?.scheduled_arrival_at
  if (!scheduled || !row.arrival_at || scheduled === row.arrival_at) return null
  return formatTime(scheduled, timeZone)
}

export interface Filters {
  readonly status: StatusFilter
  readonly query: string
  readonly window: WindowFilter
  /** Windows apply only when the board shows today. */
  readonly isToday: boolean
}

export function filterRows(rows: readonly ArrivalBoardRow[], filters: Filters, now: Date): ArrivalBoardRow[] {
  const needle = filters.query.trim().toLowerCase()
  const limit = filters.window === 'day' || !filters.isToday ? null : now.getTime() + WINDOW_HOURS[filters.window] * HOUR
  return rows.filter((row) => {
    if (filters.status !== 'all' && row.status !== filters.status) return false
    if (limit !== null) {
      const at = row.arrival_at ? new Date(row.arrival_at).getTime() : null
      if (at === null || at < now.getTime() - HOUR || at > limit) return false
    }
    if (!needle) return true
    return `${row.principal_name ?? ''} ${row.delegation_name} ${row.flight?.flight_number ?? ''}`.toLowerCase().includes(needle)
  })
}

export interface HourGroup {
  readonly hour: string
  /** Start of the hour, for placing the "now" line. */
  readonly starts_at: number
  readonly rows: ArrivalBoardRow[]
}

export function groupByHour(rows: readonly ArrivalBoardRow[], timeZone: string): HourGroup[] {
  return rows.reduce<HourGroup[]>((groups, row) => {
    const hour = row.arrival_at ? `${formatTime(row.arrival_at, timeZone).slice(0, 2)}:00` : 'Time to follow'
    const startsAt = row.arrival_at ? Math.floor(new Date(row.arrival_at).getTime() / HOUR) * HOUR : Number.POSITIVE_INFINITY
    const last = groups.at(-1)
    if (last?.hour === hour) return [...groups.slice(0, -1), { ...last, rows: [...last.rows, row] }]
    return [...groups, { hour, starts_at: startsAt, rows: [row] }]
  }, [])
}
