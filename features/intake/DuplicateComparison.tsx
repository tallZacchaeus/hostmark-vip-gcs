'use client'
// Side by side: the existing delegation and the new submission (FR-IN-08, 03-App-Flow.md F3).
// Differences are marked; nothing is merged automatically. While the submission is open, the
// reviewer can tick the differing contact, diet and extra guests to copy them when linking.
import { formatTime } from '@/lib/client/format'
import type { LinkUpdate } from '@/lib/domain/intake/link-updates'
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

type Row = readonly [label: string, existing: string, incoming: string, update?: LinkUpdate]

const APPLY_LABELS: Record<LinkUpdate, string> = {
  contact: 'Apply the new contact',
  dietary: 'Apply the new diet',
  companions: 'Add the new guests',
}

const same = (a: string, b: string): boolean => a.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase() === b.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
const orDash = (value: string | null | undefined): string => (value && value.trim() !== '' ? value : '—')

function rowsFor(existing: DelegationSummary, incoming: IntakeFields, timeZone: string): Row[] {
  return [
    ['Name', guestName(existing.title, existing.full_name), guestName(incoming.title, incoming.full_name)],
    ['Arrival mode', existing.arrival_mode ? ARRIVAL_MODE_LABELS[existing.arrival_mode] : '—', incoming.arrival_mode ? ARRIVAL_MODE_LABELS[incoming.arrival_mode] : '—'],
    ['Arrival date', existing.arrival_at ? zonedDateKey(existing.arrival_at, timeZone) : '—', orDash(incoming.arrival_date)],
    ['Arrival time', existing.arrival_at ? formatTime(existing.arrival_at, timeZone) : '—', orDash(incoming.arrival_time)],
    ['Flight', orDash(existing.flight_number), orDash(incoming.flight_number.toUpperCase())],
    // Only more guests can be added by linking; a smaller party is a change to make by hand.
    ['Guests', String(existing.companions + 1), String(incoming.party.length + 1), incoming.party.length > existing.companions ? 'companions' : undefined],
    ['Diet', existing.dietary.length ? existing.dietary.join(', ') : 'None stated', orDash(incoming.dietary) === '—' ? 'None stated' : incoming.dietary, 'dietary'],
    ['Contact', orDash(existing.contact_phone ?? existing.contact_email), orDash(incoming.contact_phone || incoming.contact_email), 'contact'],
  ]
}

export interface ApplyChoices {
  readonly chosen: readonly LinkUpdate[]
  readonly onToggle: (update: LinkUpdate) => void
}

interface DuplicateComparisonProps {
  readonly existing: DelegationSummary
  readonly incoming: IntakeFields
  readonly timeZone: string
  /** Present while the submission is open: offers a tickbox on each differing row linking can copy. */
  readonly choices?: ApplyChoices
}

export function DuplicateComparison({ existing, incoming, timeZone, choices }: DuplicateComparisonProps) {
  const rows = rowsFor(existing, incoming, timeZone)
  const applyBox = (row: Row) => {
    const update = row[3]
    if (!choices || !update || same(row[1], row[2])) return null
    return (
      <label>
        <input type="checkbox" checked={choices.chosen.includes(update)} onChange={() => choices.onToggle(update)} aria-label={APPLY_LABELS[update]} />
        Apply
      </label>
    )
  }
  const column = (title: string, pick: (row: Row) => string, withChoices = false) => (
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
            {withChoices && applyBox(row)}
          </div>
        )
      })}
    </section>
  )
  return (
    <>
      <div className="duplicate-grid">
        {column(`Existing${existing.reference_code ? ` (${existing.reference_code})` : ''}`, (row) => row[1])}
        {column('New submission', (row) => row[2], true)}
      </div>
      {choices && <p className="comparison-note">Linking copies only what you tick. Arrival details are not copied: flight times come from flight tracking.</p>}
    </>
  )
}
