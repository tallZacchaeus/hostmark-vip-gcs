// The programme timeline (FR-PG-04, Figma "Programme"): the event's days, each item's state and the
// venues in use. Pure; the at-risk flag itself is kept by the database (FR-PG-03).
import { addDays } from '@/lib/domain/time'

export type ProgramStatus = 'draft' | 'published' | 'cancelled'
export type ItemState = 'track' | 'risk' | 'done' | 'cancelled'

/** Every day from the first to the last event day (YYYY-MM-DD), inclusive. */
export function eventDays(startsOn: string, endsOn: string): string[] {
  const days: string[] = []
  for (let day = startsOn; day <= endsOn; day = addDays(day, 1)) days.push(day)
  return days
}

/** Cancelled, then done once it has ended, then at risk, else on track. */
export function itemState(item: { readonly status: ProgramStatus; readonly at_risk: boolean; readonly ends_at: string }, now: number): ItemState {
  if (item.status === 'cancelled') return 'cancelled'
  if (Date.parse(item.ends_at) <= now) return 'done'
  return item.at_risk ? 'risk' : 'track'
}

/** Locations of the day's live (not cancelled) items, busiest first. */
export function venueCounts(items: readonly { readonly location: string; readonly status: ProgramStatus }[]): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    if (item.status !== 'cancelled') counts.set(item.location, (counts.get(item.location) ?? 0) + 1)
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
