// Calendar arithmetic in the event's time zone, shared by the server (intake normalisation,
// pickup times) and the browser (filters, shift forms). Pure: no clock, no I/O.

function zonedParts(instant: Date, timeZone: string): Record<string, string> {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  return Object.fromEntries(formatted.map((part) => [part.type, part.value]))
}

/** Minutes the zone is ahead of UTC at that instant (Lagos: 60). */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const { year, month, day, hour, minute, second } = zonedParts(instant, timeZone)
  const asUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
  return Math.round((asUtc - instant.getTime()) / 60_000)
}

/** The instant a calendar day ("2026-10-28") starts in the zone, as an ISO string. */
export function zonedDayStart(day: string, timeZone: string): string {
  const [year, month, date] = day.split('-').map(Number)
  const naive = Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1)
  // Two passes settle the offset across a daylight-saving change.
  const first = naive - zoneOffsetMinutes(new Date(naive), timeZone) * 60_000
  return new Date(naive - zoneOffsetMinutes(new Date(first), timeZone) * 60_000).toISOString()
}

/** A wall-clock time ("14:30") on a calendar day in the zone, as an ISO instant. */
export function zonedDateTime(day: string, time: string, timeZone: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const start = Date.parse(zonedDayStart(day, timeZone))
  return new Date(start + ((hours ?? 0) * 60 + (minutes ?? 0)) * 60_000).toISOString()
}

/** The calendar date ("2026-10-28") of an instant in the zone. */
export function zonedDateKey(instant: Date | string, timeZone: string): string {
  const { year, month, day } = zonedParts(instant instanceof Date ? instant : new Date(instant), timeZone)
  return `${year}-${month}-${day}`
}

/** "2026-10-28" plus `days` (may be negative). */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** ISO instant plus minutes. */
export function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString()
}
