// Event dates for the db and integration tests, derived from the real clock. Postgres now() in PGlite
// is the real time, so fixed dates would drift into the past and change what the rules decide (the
// intake window, the post-event purge, "upcoming" lists). The test event always starts EVENT_LEAD_DAYS
// from today (UTC) and runs four days, EVENT_DAY..EVENT_LAST_DAY, in Africa/Lagos (UTC+1).
import { addDays } from '@/lib/domain/time'

export { addDays }

const EVENT_LEAD_DAYS = 10
const EVENT_LENGTH_DAYS = 4

/** The event's first day ("YYYY-MM-DD"), computed once per test file. */
export const EVENT_DAY = addDays(new Date().toISOString().slice(0, 10), EVENT_LEAD_DAYS)
/** The event's last day (EVENT_DAY + 3). */
export const EVENT_LAST_DAY = addDays(EVENT_DAY, EVENT_LENGTH_DAYS - 1)
/** The day before the event. */
export const DAY_BEFORE_EVENT = addDays(EVENT_DAY, -1)

/** "<EVENT_DAY + offset>T<time>", e.g. eventTime(0, '14:00:00Z') for 14:00 UTC on the first day. */
export function eventTime(dayOffset: number, time: string): string {
  return `${addDays(EVENT_DAY, dayOffset)}T${time}`
}

/** Dates for an event that is already over (for the post-event purge): it ended a week ago. */
export const PAST_EVENT = { starts_on: addDays(EVENT_DAY, -20), ends_on: addDays(EVENT_DAY, -17) } as const
