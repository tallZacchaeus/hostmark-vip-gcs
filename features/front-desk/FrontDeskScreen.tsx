'use client'
// Front desk (03-App-Flow.md /staff/front-desk, Figma "Front desk", FR-RA-09): parties arriving,
// in house and leaving, one card per party with its rooms. Check in confirms in a sheet, can be
// undone for a few minutes, and the first confirmation wins — a second one is told who did it.
// Check out (In house and Leaving, FR-CL-01) sends each emptied room to housekeeping; the
// coordinator can reverse a mistaken one from Sanitation.
import { useId, useState } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useTimeZone } from '@/components/shell/SessionContext'
import { ApiClientError, apiSend, errorMessage } from '@/lib/client/api'
import { formatLongDay, formatTime } from '@/lib/client/format'
import { refreshApi, useApi } from '@/lib/client/use-api'
import type { DeskParty, DeskTab, FrontDesk } from '@/lib/repositories/front-desk'

const DESK_PATH = '/api/front-desk'
const REFRESH_MS = 60_000

const TABS: readonly (readonly [DeskTab, string, IconName])[] = [
  ['arriving', 'Arriving', 'logIn'],
  ['in_house', 'In house', 'bed'],
  ['leaving', 'Leaving', 'logOut'],
]

const EMPTY: Readonly<Record<DeskTab, readonly [string, string]>> = {
  arriving: ['Nobody is arriving on this day.', 'New arrivals appear here once their rooms are planned.'],
  in_house: ['Nobody is in house yet.', 'Checked-in guests will appear here.'],
  leaving: ['Nobody is leaving on this day.', 'Departures appear here when they are due.'],
}

type Conflict = { readonly by: string; readonly at: string }
type DeskAction = 'check-in' | 'check-out'

function badge(party: DeskParty, tab: DeskTab): { readonly label: string; readonly tone: string; readonly icon: IconName } {
  if (tab !== 'arriving') return tab === 'leaving' ? { label: 'Leaving today', tone: 'neutral', icon: 'clock' } : { label: 'In house', tone: 'ready', icon: 'check' }
  if (!party.rooms_ready) return { label: party.rooms.length === 1 ? `Room ${party.rooms[0]} not ready` : 'A room is not ready', tone: 'warning', icon: 'alert' }
  return party.on_the_way ? { label: 'On the way', tone: 'way', icon: 'navigation' } : { label: 'Expected', tone: 'neutral', icon: 'clock' }
}

function timing(party: DeskParty, tab: DeskTab, timeZone: string): string {
  if (tab === 'arriving') return `Expected ${formatTime(party.check_in, timeZone)}`
  if (tab === 'leaving') return `Departs ${formatTime(party.check_out, timeZone)}`
  return party.checked_in_at ? `Checked in ${formatTime(party.checked_in_at, timeZone)}` : 'In house'
}

interface CardProps {
  readonly party: DeskParty
  readonly tab: DeskTab
  readonly timeZone: string
  readonly conflict: Conflict | undefined
  readonly onAction: (action: DeskAction) => void
}

function Card({ party, tab, timeZone, conflict, onAction }: CardProps) {
  const status = badge(party, tab)
  const arriving = tab === 'arriving'
  const blocked = arriving && !party.rooms_ready
  return (
    <article className={`front-desk-card ${blocked ? 'is-not-ready' : ''}`} aria-label={party.name}>
      <div className={`room-key-tag ${blocked ? 'is-warning' : ''}`}>
        <small>ROOM</small>
        <b>{party.rooms[0] ?? '–'}</b>
      </div>
      <div className="front-desk-guest">
        <h2>{party.name}</h2>
        <p>
          {party.category ? `${party.category} · ` : ''}
          {timing(party, tab, timeZone)}
        </p>
        <span className={`front-desk-badge is-${status.tone}`}>
          <Icon name={status.icon} size={14} />
          {status.label}
        </span>
      </div>
      {arriving ? (
        <div className="front-desk-party">
          Party of {party.party_size} · {party.rooms.length === 1 ? `room ${party.rooms[0]}` : `rooms ${party.rooms.join(', ')}`}
          {party.rooms_ready ? (
            <i>
              <Icon name="check" size={12} />
              ready
            </i>
          ) : null}
        </div>
      ) : null}
      {conflict ? (
        <div className="front-desk-conflict">
          <Icon name="info" size={16} />
          Already checked in by {conflict.by} at {formatTime(conflict.at, timeZone)}.
        </div>
      ) : arriving ? (
        <>
          <button type="button" className="front-desk-action is-primary" disabled={blocked} onClick={() => onAction('check-in')}>
            <Icon name="logIn" />
            Check in
          </button>
          {blocked ? (
            <div className="front-desk-housekeeping">
              <Icon name="loader" size={16} />
              Housekeeping is on it.
            </div>
          ) : null}
        </>
      ) : (
        <button type="button" className="front-desk-action is-secondary" onClick={() => onAction('check-out')}>
          <Icon name="logOut" />
          Check out
        </button>
      )}
    </article>
  )
}

interface ConfirmSheetProps {
  readonly party: DeskParty
  readonly action: DeskAction
  readonly onConfirm: () => void
  readonly onClose: () => void
  readonly busy: boolean
}

function ConfirmSheet({ party, action, onConfirm, onClose, busy }: ConfirmSheetProps) {
  const titleId = useId()
  const roomList = party.rooms.length === 1 ? `room ${party.rooms[0]}` : `rooms ${party.rooms.join(', ')}`
  const checkingIn = action === 'check-in'
  return (
    <Modal onClose={onClose} scrimClassName="front-desk-sheet-scrim" className="front-desk-sheet" labelledBy={titleId}>
      <i className="sheet-grab" />
      <h2 id={titleId}>{checkingIn ? `Check in ${party.name} to room ${party.rooms[0]}?` : `Check out ${party.name} from ${roomList}?`}</h2>
      <p>{checkingIn ? `The party of ${party.party_size} will be checked in to ${roomList}.` : `The ${party.rooms.length === 1 ? 'room goes' : 'rooms go'} to housekeeping.`}</p>
      <button type="button" className="front-desk-confirm" disabled={busy} onClick={onConfirm}>
        {busy ? (checkingIn ? 'Checking in…' : 'Checking out…') : 'Confirm'}
      </button>
      <button type="button" className="front-desk-cancel" onClick={onClose}>
        Cancel
      </button>
    </Modal>
  )
}

function useDeskActions(timeZone: string) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [conflicts, setConflicts] = useState<Readonly<Record<string, Conflict>>>({})
  const undo = (party: DeskParty) => {
    void apiSend(`/api/front-desk/${party.delegation_id}/undo-check-in`, 'POST', {})
      .then(() => toast.show({ message: `Check-in undone for ${party.name}.` }))
      .catch((caught: unknown) => toast.show({ message: errorMessage(caught), tone: 'error' }))
      .finally(() => void refreshApi(DESK_PATH))
  }
  const checkIn = async (party: DeskParty): Promise<void> => {
    setBusy(true)
    try {
      await apiSend(`/api/front-desk/${party.delegation_id}/check-in`, 'POST', {})
      toast.show({ message: 'Checked in', action: { label: 'Undo', run: () => undo(party) } })
    } catch (caught: unknown) {
      if (caught instanceof ApiClientError && caught.code === 'already_checked_in') {
        const details = caught.details as Conflict | undefined
        if (details) setConflicts((current) => ({ ...current, [party.delegation_id]: details }))
      } else {
        toast.show({ message: errorMessage(caught), tone: 'error' })
      }
    } finally {
      setBusy(false)
      await refreshApi(DESK_PATH, '/api/rooms', '/api/guests')
    }
  }
  // The checked-out party leaves the list on refresh, so a lost race is told in a toast.
  const checkOut = async (party: DeskParty): Promise<void> => {
    setBusy(true)
    try {
      await apiSend(`/api/front-desk/${party.delegation_id}/check-out`, 'POST', {})
      toast.show({ message: `Checked out. ${party.rooms.length === 1 ? `Room ${party.rooms[0]} goes` : 'The rooms go'} to housekeeping.` })
    } catch (caught: unknown) {
      const details = caught instanceof ApiClientError && caught.code === 'already_checked_out' ? (caught.details as Conflict | undefined) : undefined
      toast.show(details ? { message: `Already checked out by ${details.by} at ${formatTime(details.at, timeZone)}.`, tone: 'info' } : { message: errorMessage(caught), tone: 'error' })
    } finally {
      setBusy(false)
      await refreshApi(DESK_PATH, '/api/rooms', '/api/guests', '/api/cleaning')
    }
  }
  return { busy, conflicts, checkIn, checkOut }
}

export function FrontDeskScreen() {
  const timeZone = useTimeZone()
  const [tab, setTab] = useState<DeskTab>('arriving')
  const [query, setQuery] = useState('')
  const [sheet, setSheet] = useState<{ readonly party: DeskParty; readonly action: DeskAction } | null>(null)
  const { data, error } = useApi<FrontDesk>(DESK_PATH, { refreshInterval: REFRESH_MS })
  const actions = useDeskActions(timeZone)
  const needle = query.trim().toLowerCase()
  const parties = (data?.[tab] ?? []).filter((party) => !needle || `${party.name} ${party.rooms.join(' ')}`.toLowerCase().includes(needle))
  const [emptyTitle, emptyText] = needle ? ['No guest or room matches.', 'Check the spelling or try a room number.'] : EMPTY[tab]

  return (
    <main className="front-desk-page">
      <div className="driver-phone-frame front-desk-frame">
        <div className="front-desk-content">
          <header className="front-desk-header">
            <h1>Front desk</h1>
            <p>{data ? formatLongDay(`${data.day}T12:00:00Z`, 'UTC') : ' '}</p>
          </header>
          {error ? (
            <div className="front-desk-offline" role="alert">
              <Icon name="wifiOff" />
              <span>{data ? "You're offline. Showing your last update." : errorMessage(error)}</span>
            </div>
          ) : null}
          <label className="front-desk-search">
            <Icon name="search" size={19} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a guest or room" aria-label="Find a guest or room" />
          </label>
          <section className="front-desk-list" aria-label={TABS.find(([value]) => value === tab)?.[1]}>
            {data && parties.length === 0 ? (
              <div className="front-desk-empty">
                <span>
                  <Icon name={needle ? 'search' : (TABS.find(([value]) => value === tab)?.[2] ?? 'bed')} size={34} />
                </span>
                <h2>{emptyTitle}</h2>
                <p>{emptyText}</p>
              </div>
            ) : (
              parties.map((party) => <Card key={party.delegation_id} party={party} tab={tab} timeZone={timeZone} conflict={actions.conflicts[party.delegation_id]} onAction={(action) => setSheet({ party, action })} />)
            )}
          </section>
        </div>
        <nav className="driver-tabbar front-desk-tabbar" aria-label="Front desk">
          {TABS.map(([value, label, icon]) => (
            <button type="button" key={value} className={tab === value ? 'is-active' : ''} aria-current={tab === value ? 'page' : undefined} onClick={() => setTab(value)}>
              <Icon name={icon} />
              <span>{label}</span>
              {value === 'arriving' && data && data.arriving.length > 0 ? <b>{data.arriving.length}</b> : null}
            </button>
          ))}
        </nav>
        {sheet ? (
          <ConfirmSheet
            party={sheet.party}
            action={sheet.action}
            busy={actions.busy}
            onClose={() => setSheet(null)}
            onConfirm={() => {
              const run = sheet.action === 'check-in' ? actions.checkIn : actions.checkOut
              void run(sheet.party).then(() => setSheet(null))
            }}
          />
        ) : null}
      </div>
    </main>
  )
}
