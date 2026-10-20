// Display formatting. Times are always shown in the event's time zone on a 24-hour clock
// (04-UI-UX-Design-Brief.md section 3); date-only values ("2026-10-28") never shift by zone.

export { addDays, zonedDateTime, zonedDayStart } from '@/lib/domain/time'

type DateInput = string | Date

const LOCALE = 'en-GB'

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value)
}

function parts(value: DateInput, timeZone: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const formatted = new Intl.DateTimeFormat(LOCALE, { timeZone, ...options }).formatToParts(toDate(value))
  return Object.fromEntries(formatted.map((part) => [part.type, part.value]))
}

/** "14:05" */
export function formatTime(value: DateInput, timeZone: string): string {
  const { hour, minute } = parts(value, timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${hour}:${minute}`
}

/** "Wed, 28 Oct 2026" */
export function formatDay(value: DateInput, timeZone: string): string {
  const { weekday, day, month, year } = parts(value, timeZone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  return `${weekday}, ${day} ${month} ${year}`
}

/** "Wed 28 Oct" */
export function formatShortDay(value: DateInput, timeZone: string): string {
  const { weekday, day, month } = parts(value, timeZone, { weekday: 'short', day: 'numeric', month: 'short' })
  return `${weekday} ${day} ${month}`
}

/** "Wednesday 28 October" */
export function formatLongDay(value: DateInput, timeZone: string): string {
  const { weekday, day, month } = parts(value, timeZone, { weekday: 'long', day: 'numeric', month: 'long' })
  return `${weekday} ${day} ${month}`
}

/** "Wed 28 Oct 14:05" */
export function formatDayTime(value: DateInput, timeZone: string): string {
  return `${formatShortDay(value, timeZone)} ${formatTime(value, timeZone)}`
}

/** The calendar date ("2026-10-28") of an instant in the given zone. */
export function dateKey(value: DateInput, timeZone: string): string {
  const { year, month, day } = parts(value, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' })
  return `${year}-${month}-${day}`
}

/** "2026-10-28" → "Wed 28 Oct" without any time-zone shift. */
export function formatIsoDate(value: string): string {
  return formatShortDay(`${value}T12:00:00Z`, 'UTC')
}

/** Minutes from `from` to `to` (negative when `to` is earlier). */
export function minutesBetween(from: DateInput, to: DateInput): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 60_000)
}

/** "+45 min", "-10 min", "+1 h 05 min" */
export function formatDelay(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  const absolute = Math.abs(minutes)
  if (absolute < 60) {
    return `${sign}${absolute} min`
  }
  const hours = Math.floor(absolute / 60)
  const rest = absolute % 60
  return rest === 0 ? `${sign}${hours} h` : `${sign}${hours} h ${String(rest).padStart(2, '0')} min`
}

/** "Ada Nwosu" → "AN"; titles such as "Dr." or "Hon." are skipped. */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '' && !word.endsWith('.'))
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words
  return letters
    .map((word) => word?.[0] ?? '')
    .join('')
    .toUpperCase()
}

/** "1 guest", "3 guests" */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/** "Good morning" / "Good afternoon" / "Good evening" for the hour in the event's zone. */
export function greeting(now: DateInput, timeZone: string): string {
  const hour = Number(parts(now, timeZone, { hour: '2-digit', hourCycle: 'h23' }).hour)
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** First name for greetings: "Ada Nwosu" → "Ada". */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName
}
