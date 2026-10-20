'use client'
// Arrivals (03-App-Flow.md /arrivals, Figma "Arrivals"): everyone arriving on a day, grouped by
// hour, with live flight status, the pickup and its driver. Rows open the guest profile; the
// pickup and driver cells open Transport. Refreshes on every live notification and each minute.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type MouseEvent, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Skeleton } from '@/components/ui/Status'
import { useSession, useTimeZone } from '@/components/shell/SessionContext'
import { useNow } from '@/components/shell/useNow'
import { withQuery } from '@/lib/client/api'
import { dateKey, formatIsoDate, formatLongDay, formatTime, plural } from '@/lib/client/format'
import { useApi } from '@/lib/client/use-api'
import {
  type ArrivalBoardRow,
  type ArrivalsBoard,
  type StatusFilter,
  type WindowFilter,
  filterRows,
  flightBadge,
  groupByHour,
  needsDriver,
  pickupBadge,
  previousTime,
  suggestionLabel,
} from './model'

const REFRESH_MS = 60_000
const WINDOWS: readonly (readonly [WindowFilter, string])[] = [
  ['2h', 'Next 2 h'],
  ['6h', 'Next 6 h'],
  ['day', 'All day'],
]

function ArrivalBadge({ tone, children }: { readonly tone: string; readonly children: string }) {
  return <span className={`arrival-badge arrival-badge--${tone}`}>{children}</span>
}

function FlightCell({ row }: { readonly row: ArrivalBoardRow }) {
  const badge = flightBadge(row)
  if (!row.flight || !badge) {
    const label = row.mode === 'own_transport' ? 'Own transport' : row.mode === 'pickup' ? 'Pickup requested' : 'Flight to follow'
    return (
      <div className="arrival-flight">
        <span className="arrival-transport">
          {label}
          {row.pickup_address && <small>{row.pickup_address}</small>}
        </span>
      </div>
    )
  }
  return (
    <div className="arrival-flight">
      <code>{row.flight.flight_number}</code>
      <ArrivalBadge tone={badge.tone}>{badge.label}</ArrivalBadge>
    </div>
  )
}

function TransportCells({ row, openTransport }: { readonly row: ArrivalBoardRow; readonly openTransport: (event: MouseEvent) => void }) {
  const pickup = pickupBadge(row)
  const suggestion = suggestionLabel(row)
  return (
    <>
      <div className="arrival-pickup" onClick={openTransport}>
        <ArrivalBadge tone={pickup.tone}>{pickup.label}</ArrivalBadge>
      </div>
      <div className="arrival-driver" onClick={openTransport}>
        {needsDriver(row) ? (
          <ArrivalBadge tone="error">Needs a driver</ArrivalBadge>
        ) : (
          <>
            {row.drivers.length > 0 && <span>{row.drivers.join(', ')}</span>}
            {suggestion && (
              <span className="arrival-suggested">
                <Icon name="sparkle" size={13} />
                {suggestion}
              </span>
            )}
          </>
        )}
      </div>
    </>
  )
}

function ArrivalRow({ row, timeZone }: { readonly row: ArrivalBoardRow; readonly timeZone: string }) {
  const router = useRouter()
  const before = previousTime(row, timeZone)
  const openTransport = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    router.push('/transport')
  }
  const name = row.principal_name ?? row.delegation_name
  const href = row.principal_guest_id ? `/guests/${row.principal_guest_id}` : '/guests'
  return (
    <Link className={`arrival-row ${row.attention ? 'is-attention' : ''}`} href={href} title={row.attention ?? undefined}>
      <div className="arrival-time">
        <b>{row.arrival_at ? formatTime(row.arrival_at, timeZone) : '–'}</b>
        {before && (
          <span>
            <s>{before}</s>
            <em>Changed</em>
          </span>
        )}
      </div>
      <div className="arrival-guest">
        <b>{name}</b>
        <span>{row.category ?? 'No category'}</span>
        {row.party_size > 1 && <small>+{row.party_size - 1}</small>}
      </div>
      <FlightCell row={row} />
      <TransportCells row={row} openTransport={openTransport} />
      <div className="arrival-mobile-details">
        <FlightCell row={row} />
        <TransportCells row={row} openTransport={openTransport} />
      </div>
      <span className="arrival-open" aria-hidden="true">
        <Icon name="arrow" size={18} />
        <b>Open →</b>
      </span>
    </Link>
  )
}

interface FilterBarProps {
  readonly board: ArrivalsBoard | undefined
  readonly day: string | undefined
  readonly setDay: (day: string) => void
  readonly windowFilter: WindowFilter
  readonly setWindow: (value: WindowFilter) => void
  readonly status: StatusFilter
  readonly setStatus: (value: StatusFilter) => void
  readonly query: string
  readonly setQuery: (value: string) => void
  readonly isToday: boolean
}

function FilterBar({ board, day, setDay, windowFilter, setWindow, status, setStatus, query, setQuery, isToday }: FilterBarProps) {
  return (
    <div className="arrivals-filters">
      {isToday ? (
        <div className="arrival-segments" role="group" aria-label="Time window">
          {WINDOWS.map(([value, label]) => (
            <button type="button" key={value} className={windowFilter === value ? 'is-active' : ''} aria-pressed={windowFilter === value} onClick={() => setWindow(value)}>
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {board && board.days.length > 1 ? (
        <label className="arrival-status-select arrival-day-select">
          <select value={day ?? board.day} onChange={(event) => setDay(event.target.value)} aria-label="Day">
            {board.days.map((item) => (
              <option key={item} value={item}>
                {formatIsoDate(item)}
              </option>
            ))}
          </select>
          <Icon name="chevron" size={15} />
        </label>
      ) : null}
      <label className="arrival-status-select">
        <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} aria-label="Status">
          <option value="all">All status</option>
          <option value="landed">Landed</option>
          <option value="delayed">Delayed</option>
          <option value="cancelled">Cancelled</option>
          <option value="due">Due</option>
        </select>
        <Icon name="chevron" size={15} />
      </label>
      <label className="arrival-search">
        <Icon name="search" size={18} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guest or flight" aria-label="Search guest or flight" />
      </label>
    </div>
  )
}

function LoadingRows() {
  return (
    <div className="arrival-loading">
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <div key={index}>
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      ))}
    </div>
  )
}

function Header({ board, timeZone }: { readonly board: ArrivalsBoard | undefined; readonly timeZone: string }) {
  const { event } = useSession()
  const guests = board?.rows.reduce((sum, row) => sum + row.party_size, 0) ?? 0
  const delegations = new Set(board?.rows.map((row) => row.delegation_id)).size
  const source = event?.flight_mode === 'simulated' ? 'Simulated flight data' : 'Live flight data'
  return (
    <header className="arrivals-header">
      <h1>Arrivals</h1>
      <div>
        <span>{board ? `${formatLongDay(`${board.day}T12:00:00Z`, 'UTC')} · ${plural(delegations, 'delegation')} · ${plural(guests, 'guest')}` : 'Loading…'}</span>
        <span className="arrivals-live">
          <i />
          {board?.updated_at ? `${source} · updated ${formatTime(board.updated_at, timeZone)}` : source}
        </span>
      </div>
    </header>
  )
}

export function ArrivalsScreen() {
  const timeZone = useTimeZone()
  const now = useNow()
  const [day, setDay] = useState<string | undefined>()
  const [windowFilter, setWindow] = useState<WindowFilter>('day')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const { data: board, error, isLoading, mutate } = useApi<ArrivalsBoard>(withQuery('/api/arrivals', { day }), { refreshInterval: REFRESH_MS })
  const isToday = Boolean(board && now && board.day === dateKey(now, timeZone))
  const rows = board && now ? filterRows(board.rows, { status, query, window: windowFilter, isToday }, now) : (board?.rows ?? [])
  const groups = groupByHour(rows, timeZone)
  const nowIndex = isToday && now ? groups.findIndex((group) => group.starts_at > now.getTime()) : -1
  const showAll = () => {
    setWindow('day')
    setStatus('all')
    setQuery('')
  }

  return (
    <main className="arrivals-page">
      <Header board={board} timeZone={timeZone} />
      {error ? (
        <div className="arrivals-error" role="alert">
          <Icon name="alert" />
          <span>{board?.updated_at ? `We couldn't refresh flight data. Showing the last update at ${formatTime(board.updated_at, timeZone)}.` : "We couldn't load arrivals."}</span>
          <Button onClick={() => void mutate()}>Retry</Button>
        </div>
      ) : null}
      <FilterBar {...{ board, day, setDay, windowFilter, setWindow, status, setStatus, query, setQuery, isToday }} />
      <section className="arrivals-card" aria-busy={isLoading || undefined}>
        {isLoading && !board ? (
          <LoadingRows />
        ) : board && board.rows.length === 0 ? (
          <div className="arrival-empty">
            <span>
              <Icon name="plane" size={28} />
            </span>
            <h2>No arrivals on this day.</h2>
            <p>Arrivals appear once guests register with their travel details.</p>
          </div>
        ) : board ? (
          <>
            <div className="arrivals-table-head" aria-hidden="true">
              <span>Time</span>
              <span>Guest</span>
              <span>Flight</span>
              <span>Pickup</span>
              <span>Driver</span>
              <span />
            </div>
            {rows.length === 0 ? (
              <div className="arrival-no-results">
                <b>No arrivals match.</b>
                <span>Try a different search, status or time window.</span>
                <Button onClick={showAll}>Show all</Button>
              </div>
            ) : (
              <div>
                {groups.map((group, index) => (
                  <div className="arrival-group" key={`${group.hour}-${index}`}>
                    {index === nowIndex && now ? (
                      <div className="arrival-now">
                        <i />
                        <b>Now · {formatTime(now, timeZone)}</b>
                        <span />
                      </div>
                    ) : null}
                    <div className="arrival-hour">
                      <span>{group.hour}</span>
                      <i />
                    </div>
                    {group.rows.map((row) => (
                      <ArrivalRow key={row.arrival_id} row={row} timeZone={timeZone} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </section>
    </main>
  )
}
