'use client'
// Activity log (FR-PL-07, F10): everything that changed on a day, newest first, with Undo on
// automatic changes. Filters map onto /api/audit query parameters; search filters the loaded rows.
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Skeleton } from '@/components/ui/Status'
import { useToast } from '@/components/ui/Toast'
import { useTimeZone } from '@/components/shell/SessionContext'
import { useNow } from '@/components/shell/useNow'
import { type ActivityDomain, type AuditEntry, actorLabel, objectOf, tablesForDomain, verbOf } from '@/lib/client/activity-format'
import { apiSend, errorMessage, withQuery } from '@/lib/client/api'
import { addDays, dateKey, formatLongDay, plural, zonedDayStart } from '@/lib/client/format'
import { useApi } from '@/lib/client/use-api'
import { ActivityRecord } from './ActivityRecord'

type Who = 'everyone' | 'staff' | 'copilot' | 'automatic'
type Day = 'today' | 'yesterday'

const PAGE_SIZE = 200
const DOMAINS: readonly ActivityDomain[] = ['Arrivals', 'Transport', 'Rooms', 'Sanitation', 'Intake', 'Programme', 'Setup']
const WHO_LABELS: Readonly<Record<Who, string>> = { everyone: 'Everyone', staff: 'Staff', copilot: 'Victoria', automatic: 'Automatic' }

function auditPath(today: string, day: Day, who: Who, domain: ActivityDomain | 'all', timeZone: string): string {
  const date = day === 'today' ? today : addDays(today, -1)
  return withQuery('/api/audit', {
    limit: PAGE_SIZE,
    from: zonedDayStart(date, timeZone),
    to: zonedDayStart(addDays(date, 1), timeZone),
    automatic: who === 'automatic' ? true : undefined,
    actor_type: who === 'staff' ? 'user' : who === 'copilot' ? 'copilot' : undefined,
    entity_types: domain === 'all' ? undefined : tablesForDomain(domain).join(','),
  })
}

function matches(entry: AuditEntry, needle: string): boolean {
  if (!needle) return true
  return `${actorLabel(entry)} ${verbOf(entry.action)} ${objectOf(entry).label} ${entry.reason ?? ''}`.toLowerCase().includes(needle)
}

export function ActivityScreen() {
  const timeZone = useTimeZone()
  const toast = useToast()
  const now = useNow(60_000)
  const [query, setQuery] = useState('')
  const [who, setWho] = useState<Who>('everyone')
  const [domain, setDomain] = useState<ActivityDomain | 'all'>('all')
  const [day, setDay] = useState<Day>('today')
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [undoing, setUndoing] = useState<string | null>(null)

  const today = now ? dateKey(now, timeZone) : null
  const { data, meta, error, isLoading, mutate } = useApi<AuditEntry[]>(today ? auditPath(today, day, who, domain, timeZone) : null)
  const needle = query.trim().toLowerCase()
  const rows = (data ?? []).filter((entry) => matches(entry, needle))
  const filtersActive = needle !== '' || who !== 'everyone' || domain !== 'all'
  const heading = today ? formatLongDay(`${day === 'today' ? today : addDays(today, -1)}T12:00:00Z`, 'UTC') : ''

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const undo = async (entry: AuditEntry) => {
    setUndoing(entry.id)
    try {
      await apiSend(`/api/audit/${entry.id}/undo`, 'POST', {})
      toast.show({ message: `Undone: ${verbOf(entry.action)} ${objectOf(entry).label}.` })
      await mutate()
    } catch (caught: unknown) {
      toast.show({ message: errorMessage(caught), tone: 'error' })
    } finally {
      setUndoing(null)
    }
  }

  const clearFilters = () => {
    setQuery('')
    setWho('everyone')
    setDomain('all')
  }

  return (
    <main className="activity-page">
      <header className="activity-page-header">
        <h1>Activity</h1>
        <p>Everything that changed, newest first. Automatic changes can be undone.</p>
      </header>
      <div className="activity-filters">
        <label className="activity-search">
          <Icon name="search" size={18} />
          <span className="visually-hidden">Search activity</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity" />
        </label>
        <label className="activity-select">
          <span className="visually-hidden">Who</span>
          <select value={who} onChange={(event) => setWho(event.target.value as Who)}>
            {(Object.keys(WHO_LABELS) as Who[]).map((value) => (
              <option key={value} value={value}>
                {WHO_LABELS[value]}
              </option>
            ))}
          </select>
          <span aria-hidden="true">Who: {WHO_LABELS[who]}</span>
          <Icon name="chevron" size={15} />
        </label>
        <label className="activity-select">
          <span className="visually-hidden">Type</span>
          <select value={domain} onChange={(event) => setDomain(event.target.value as ActivityDomain | 'all')}>
            <option value="all">All</option>
            {DOMAINS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <span aria-hidden="true">Type: {domain === 'all' ? 'All' : domain}</span>
          <Icon name="chevron" size={15} />
        </label>
        <label className="activity-select activity-date">
          <span className="visually-hidden">Day</span>
          <select value={day} onChange={(event) => setDay(event.target.value as Day)}>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
          </select>
          <span aria-hidden="true">{day === 'today' ? 'Today' : 'Yesterday'}</span>
          <Icon name="chevron" size={15} />
        </label>
      </div>
      {error ? <ErrorBanner className="activity-error" message={errorMessage(error)} onRetry={() => void mutate()} /> : null}
      <section className="activity-list-card" aria-busy={isLoading}>
        <header>
          <h2>{heading}</h2>
          <span>{plural(rows.length, 'change')}</span>
        </header>
        {isLoading || !today ? (
          <div className="activity-loading">
            {[0, 1, 2, 3, 4].map((item) => (
              <Skeleton key={item} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className={`activity-list-empty ${filtersActive ? 'is-filtered' : ''}`}>
            <span>
              <Icon name={filtersActive ? 'searchX' : 'activity'} size={28} />
            </span>
            <b>{filtersActive ? 'No activity matches these filters.' : 'Nothing has changed on this day.'}</b>
            {filtersActive ? (
              <Button onClick={clearFilters}>Clear filters</Button>
            ) : (
              <p>Changes by staff, Victoria and automatic updates appear here.</p>
            )}
          </div>
        ) : (
          <div>
            {rows.map((entry) => (
              <ActivityRecord
                key={entry.id}
                entry={entry}
                timeZone={timeZone}
                expanded={expanded.has(entry.id)}
                onToggle={() => toggle(entry.id)}
                onUndo={(target) => void undo(target)}
                undoBusy={undoing === entry.id}
              />
            ))}
          </div>
        )}
        {meta && meta.total > meta.limit && (
          <p className="activity-more">Showing the newest {meta.limit} of {meta.total}. Narrow the filters to see older changes.</p>
        )}
      </section>
    </main>
  )
}
