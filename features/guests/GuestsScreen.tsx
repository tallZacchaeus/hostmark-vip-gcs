'use client'
// Guests (03-App-Flow.md /guests): one row per delegation with arrival, transport, room and open
// issues; tabs, search and a category filter; "Add guest" for manual entry.
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Pill, Skeleton, type Tone } from '@/components/ui/Status'
import { useTimeZone } from '@/components/shell/SessionContext'
import { ARRIVAL_MODE_LABELS, guestName } from '@/features/intake/model'
import type { VipCategory } from '@/features/settings/types'
import { withQuery } from '@/lib/client/api'
import { formatShortDay, formatTime, plural } from '@/lib/client/format'
import { useApi } from '@/lib/client/use-api'
import { useDebouncedValue } from '@/lib/client/use-debounced-value'
import { AddGuestDrawer } from './AddGuestDrawer'
import { type DelegationRow, type GuestList, type GuestTabs, PICKUP_STATUS } from './types'

const PAGE_SIZE = 50
const TABS: readonly (readonly [keyof GuestTabs, string])[] = [
  ['all', 'All'],
  ['today', 'Arriving today'],
  ['attention', 'Needs attention'],
  ['arrived', 'Arrived'],
]

function transportOf(row: DelegationRow): { label: string; tone: 'success' | 'warning' | 'info' | 'error' | 'neutral' } {
  if (row.pickup_status) return PICKUP_STATUS[row.pickup_status]
  if (row.arrival_mode === 'own_transport') return { label: 'Not needed', tone: 'neutral' }
  if (row.arrival_mode === 'flying') return { label: 'Waits for landing time', tone: 'neutral' }
  return { label: 'Not planned', tone: 'neutral' }
}

function roomOf(row: DelegationRow): { readonly label: string; readonly tone: Tone | 'suggested' } {
  const size = row.companions + 1
  const placed = row.rooms_placed ?? 0
  if (row.room_number && row.room_checked_in) return { label: `Room ${row.room_number} · in house`, tone: 'success' }
  if (row.room_number) return { label: `Room ${row.room_number}${placed < size ? ` · ${placed} of ${size} placed` : ''}`, tone: 'info' }
  return row.room_suggested ? { label: 'Suggested', tone: 'suggested' } : { label: 'Not planned', tone: 'neutral' }
}

function GuestRow({ row, timeZone }: { readonly row: DelegationRow; readonly timeZone: string }) {
  const transport = transportOf(row)
  const room = roomOf(row)
  return (
    <Link className="guest-table-row" href={`/guests/${row.principal_guest_id}`}>
      <span className="guest-cell" data-label="Guest">
        <span>
          <b>{guestName(row.title, row.full_name)}</b>
          <span className="category-chip">{row.category_name ?? 'No category'}</span>
          {row.companions > 0 && <small>+{row.companions}</small>}
        </span>
      </span>
      <span className="arrival-cell" data-label="Arrival">
        <span className="arrival-time-v4">{row.arrival_at ? `${formatShortDay(row.arrival_at, timeZone)} ${formatTime(row.arrival_at, timeZone)}` : 'Time to follow'}</span>
        <span className="arrival-details">
          {row.flight_number && <span className="flight-code">{row.flight_number}</span>}
          {row.arrival_mode && row.arrival_mode !== 'flying' && <span className="arrival-type">{ARRIVAL_MODE_LABELS[row.arrival_mode]}</span>}
        </span>
      </span>
      <span className="transport-cell" data-label="Transport">
        <Pill tone={transport.tone}>{transport.label}</Pill>
      </span>
      <span className="room-cell-v4" data-label="Room">
        <Pill tone={room.tone}>{room.label}</Pill>
      </span>
      <span className="issues-cell" data-label="Issues">
        {row.open_issues ? <Pill tone="warning">{plural(row.open_issues, 'issue')}</Pill> : <span aria-label="No open issues">–</span>}
      </span>
      <span className="row-chevron" aria-hidden="true">
        <Icon name="arrow" size={17} />
      </span>
    </Link>
  )
}

export function GuestsScreen() {
  const timeZone = useTimeZone()
  const [tab, setTab] = useState<keyof GuestTabs>('all')
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)
  const query = useDebouncedValue(search.trim())
  const categories = useApi<VipCategory[]>('/api/admin/vip-categories?limit=200')
  const { data, meta, error, isLoading, mutate } = useApi<GuestList>(withQuery('/api/guests', { tab, search: query, category_id: categoryId, page, limit: PAGE_SIZE }))
  const total = meta?.total ?? 0
  const filtered = Boolean(query || categoryId || tab !== 'all')
  const clearFilters = () => {
    setSearch('')
    setCategoryId('')
    setTab('all')
    setPage(1)
  }

  return (
    <main className="guests-page">
      <div className="guests-header">
        <div>
          <h1>Guests</h1>
          <p>{data ? `${plural(data.totals.delegations, 'delegation')} · ${plural(data.totals.guests, 'guest')}` : 'Loading…'}</p>
        </div>
        <Button kind="primary" icon="plus" onClick={() => setAdding(true)}>
          Add guest
        </Button>
      </div>
      <div className="guest-tabs" role="tablist" aria-label="Guests by status">
        {TABS.map(([value, label]) => (
          <button
            role="tab"
            type="button"
            aria-selected={tab === value}
            className={tab === value ? 'is-active' : ''}
            key={value}
            onClick={() => {
              setTab(value)
              setPage(1)
            }}
          >
            <span>{label}</span>
            <b>{data?.tabs[value] ?? '–'}</b>
          </button>
        ))}
      </div>
      <div className="guest-filters">
        <label className="guest-search">
          <Icon name="search" size={18} />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Search by name, flight or reference"
            aria-label="Search by name, flight or reference"
          />
        </label>
        <select
          className="filter-select"
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value)
            setPage(1)
          }}
          aria-label="VIP category"
        >
          <option value="">All categories</option>
          {(categories.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      {error ? <ErrorBanner className="guest-error" message="We couldn't load guests." onRetry={() => void mutate()} /> : null}
      <section className="guest-table-card" aria-busy={isLoading || undefined}>
        <div className="guest-table-head" aria-hidden="true">
          <span>Guest</span>
          <span>Arrival</span>
          <span>Transport</span>
          <span>Room</span>
          <span>Issues</span>
          <span />
        </div>
        {isLoading && !data ? (
          <div className="guest-loading">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <div key={index}>
                <Skeleton className="guest-sk-name" />
                <Skeleton className="guest-sk-cell" />
                <Skeleton className="guest-sk-cell" />
                <Skeleton className="guest-sk-cell" />
                <Skeleton className="guest-sk-small" />
              </div>
            ))}
          </div>
        ) : data && data.rows.length > 0 ? (
          <div className="guest-table-body">
            {data.rows.map((row) => (
              <GuestRow key={row.delegation_id} row={row} timeZone={timeZone} />
            ))}
          </div>
        ) : data && filtered ? (
          <div className="guest-empty">
            <span>
              <Icon name="search" />
            </span>
            <h2>No guests match.</h2>
            <Button onClick={clearFilters}>Clear filters</Button>
          </div>
        ) : data ? (
          <div className="guest-empty">
            <span>
              <Icon name="users" />
            </span>
            <h2>No guests yet.</h2>
            <p>Add a guest or share the registration link from Intake.</p>
            <Button kind="primary" icon="plus" onClick={() => setAdding(true)}>
              Add guest
            </Button>
          </div>
        ) : null}
        <footer>
          <span>
            Showing {data?.rows.length ?? 0} of {total}
          </span>
          <div>
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
              <Icon name="chevron" size={16} />
            </button>
            <button type="button" disabled={page * PAGE_SIZE >= total} onClick={() => setPage(page + 1)} aria-label="Next page">
              <Icon name="chevron" size={16} />
            </button>
          </div>
        </footer>
      </section>
      {adding && <AddGuestDrawer categories={categories.data ?? []} onClose={() => setAdding(false)} />}
    </main>
  )
}
