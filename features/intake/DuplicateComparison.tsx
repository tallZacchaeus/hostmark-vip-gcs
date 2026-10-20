'use client'
// Side by side: the existing delegation and the new submission (FR-IN-08, 03-App-Flow.md F3).
// Differences are marked; nothing is merged automatically.
import { formatTime } from '@/lib/client/format'
import { zonedDateKey } from '@/lib/domain/time'
import { ARRIVAL_MODE_LABELS, type IntakeFields, guestName } from './model'

export interface DelegationSummary {
  readonly delegation_id: string
  readonly delegation_name: string
  readonly principal_guest_id: string
  readonly title: string | null
  readonly full_name: string
  readonly companions: number
  readonly arrival_mode: 'flying' | 'own_transport' | 'pickup' | null
  readonly arrival_at: string | null
  readonly flight_number: string | null
  readonly contact_name: string | null
  readonly contact_email: string | null
  readonly contact_phone: string | null
  readonly dietary: string[]
  readonly reference_code: string | null
}

type Row = readonly [label: string, existing: string, incoming: string]

const same = (a: string, b: string): boolean => a.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase() === b.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
const orDash = (value: string | null | undefined): string => (value && value.trim() !== '' ? value : '—')

function rowsFor(existing: DelegationSummary, incoming: IntakeFields, timeZone: string): Row[] {
  return [
    ['Name', guestName(existing.title, existing.full_name), guestName(incoming.title, incoming.full_name)],
    ['Arrival mode', existing.arrival_mode ? ARRIVAL_MODE_LABELS[existing.arrival_mode] : '—', incoming.arrival_mode ? ARRIVAL_MODE_LABELS[incoming.arrival_mode] : '—'],
    ['Arrival date', existing.arrival_at ? zonedDateKey(existing.arrival_at, timeZone) : '—', orDash(incoming.arrival_date)],
    ['Arrival time', existing.arrival_at ? formatTime(existing.arrival_at, timeZone) : '—', orDash(incoming.arrival_time)],
    ['Flight', orDash(existing.flight_number), orDash(incoming.flight_number.toUpperCase())],
    ['Guests', String(existing.companions + 1), String(incoming.party.length + 1)],
    ['Diet', existing.dietary.length ? existing.dietary.join(', ') : 'None stated', orDash(incoming.dietary) === '—' ? 'None stated' : incoming.dietary],
    ['Contact', orDash(existing.contact_phone ?? existing.contact_email), orDash(incoming.contact_phone || incoming.contact_email)],
  ]
}

interface DuplicateComparisonProps {
  readonly existing: DelegationSummary
  readonly incoming: IntakeFields
  readonly timeZone: string
}

export function DuplicateComparison({ existing, incoming, timeZone }: DuplicateComparisonProps) {
  const rows = rowsFor(existing, incoming, timeZone)
  const column = (title: string, pick: (row: Row) => string) => (
    <section className="review-card comparison-card" aria-label={title}>
      <header>
        <h2>{title}</h2>
      </header>
      {rows.map((row) => {
        const different = !same(row[1], row[2])
        return (
          <div className={different ? 'is-different' : ''} key={row[0]}>
            <span>
              {row[0]}
              {different && <span>Different</span>}
            </span>
            <b>{pick(row)}</b>
          </div>
        )
      })}
    </section>
  )
  return (
    <div className="duplicate-grid">
      {column(`Existing${existing.reference_code ? ` (${existing.reference_code})` : ''}`, (row) => row[1])}
      {column('New submission', (row) => row[2])}
    </div>
  )
}
