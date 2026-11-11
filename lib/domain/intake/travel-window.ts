// The travel dates guests may choose (tester feedback, Nov 2026): from `intake_window_days` before
// the event starts to the same number of days after it ends. A 27–29 Nov event with 1 day gives
// 26–30 Nov. The registration form keeps both dates inside it; validateIntake flags any that are
// not (older links, messages pasted in by staff).
import { addDays } from '@/lib/domain/time'

export interface EventDates {
  readonly starts_on: string
  readonly ends_on: string
  readonly intake_window_days: number
}

/** Both ends inclusive, as YYYY-MM-DD. */
export interface TravelWindow {
  readonly from: string
  readonly to: string
}

export function travelWindow(event: EventDates): TravelWindow {
  return { from: addDays(event.starts_on, -event.intake_window_days), to: addDays(event.ends_on, event.intake_window_days) }
}

export function isInTravelWindow(day: string, window: TravelWindow): boolean {
  return day >= window.from && day <= window.to
}

const SHORT_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** "Choose a date from 26 Nov to 30 Nov" for the registration form. */
export function travelWindowMessage(window: TravelWindow): string {
  const day = (value: string) => SHORT_DAY.format(new Date(`${value}T12:00:00Z`))
  return `Choose a date from ${day(window.from)} to ${day(window.to)}`
}
