'use client'
// Rooms (03-App-Flow.md /rooms, Figma "Rooms"): the building by wing and floor with each room's
// status, a summary that filters, the room inspector (who is or will be there, and Move guest),
// and "Run allocator", which drafts a plan for review — nothing is assigned until approved.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type CSSProperties, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Skeleton } from '@/components/ui/Status'
import { useToast } from '@/components/ui/Toast'
import { useTimeZone } from '@/components/shell/SessionContext'
import { ApiClientError, apiSend, errorMessage } from '@/lib/client/api'
import { formatShortDay, formatTime } from '@/lib/client/format'
import { refreshApi, useApi } from '@/lib/client/use-api'
import { type BoardRoom, ROOM_STATUSES, type RoomBoardStatus, type RoomFilters, type RoomsBoard, STATUS_META, buildingLayout, headerLine, inspectorText, matchesFilters, roomLine } from './model'
import { MoveDialog, roomChoices } from './MoveDialog'

const BOARD_PATH = '/api/rooms/board'

function Inspector({ room, timeZone, onMove }: { readonly room: BoardRoom | undefined; readonly timeZone: string; readonly onMove: (room: BoardRoom) => void }) {
  if (!room) {
    return (
      <div className="room-inspector room-inspector--empty">
        <Icon name="pointer" />
        <span>Select a room to see details.</span>
      </div>
    )
  }
  const meta = STATUS_META[room.status]
  const when = (iso: string) => `${formatShortDay(iso, timeZone)} ${formatTime(iso, timeZone)}`
  const text = inspectorText(room, when)
  const planId = room.suggestions.find((item) => item.plan_id)?.plan_id
  const principal = room.stays[0]?.principal_guest_id
  return (
    <div className={`room-inspector room-inspector--${room.status === 'reserved' ? 'occupied' : room.status}`}>
      <span className="inspector-room-number">{room.number}</span>
      <div className="inspector-name">
        <div>
          <h2>Room {room.number}</h2>
          <span className={`arrival-badge arrival-badge--${meta.tone}`}>{meta.label}</span>
        </div>
        <p>
          {roomLine(room)} · {room.capacity} {room.capacity === 1 ? 'bed' : 'beds'}
          {room.is_accessible ? ' · Accessible' : ''}
        </p>
      </div>
      <div className="inspector-message">
        <Icon name={room.suggestions.length > 0 ? 'sparkle' : 'info'} size={18} />
        <span>{text}</span>
      </div>
      <div className="inspector-actions">
        {room.stays.length > 0 ? <Button onClick={() => onMove(room)}>Move guest</Button> : null}
        {planId ? (
          <Link className="hm-button" href={`/rooms/plan/${planId}`}>
            <span>Open plan</span>
          </Link>
        ) : null}
        {principal ? (
          <Link className="hm-button hm-button--ghost" href={`/guests/${principal}`}>
            <span>View guest</span>
          </Link>
        ) : null}
      </div>
    </div>
  )
}

function Building({ rooms, filters, selected, onSelect }: { readonly rooms: BoardRoom[]; readonly filters: RoomFilters; readonly selected: string | null; readonly onSelect: (id: string) => void }) {
  const layout = buildingLayout(rooms)
  const columns = ['30px', ...layout.wings.flatMap((wing, index) => [...(index > 0 ? ['18px'] : []), `minmax(0,${wing.positions.length}fr)`])].join(' ')
  const rows = { gridTemplateRows: `34px repeat(${layout.floors.length},minmax(0,1fr))` } satisfies CSSProperties
  return (
    <div className="building-scroll">
      <div className="hotel-elevation" style={{ gridTemplateColumns: columns }}>
        <div className="floor-labels" style={rows}>
          <span />
          {layout.floors.map((floor) => (
            <b key={floor}>F{floor}</b>
          ))}
        </div>
        {layout.wings.map((wing, index) => (
          <div key={wing.name} style={{ display: 'contents' }}>
            {index > 0 ? <i className="wing-gap" /> : null}
            <section className="hotel-wing" style={rows} aria-label={`${wing.name} wing`}>
              <header>
                <b>{wing.name.toUpperCase()}</b>
              </header>
              {layout.floors.map((floor) => (
                <div className="wing-floor" key={floor} style={{ gridTemplateColumns: `repeat(${wing.positions.length},minmax(0,1fr))` }}>
                  {wing.positions.map((position) => {
                    const room = wing.cells.get(floor)?.get(position)
                    if (!room) return <span key={position} />
                    const meta = STATUS_META[room.status]
                    return (
                      <button
                        type="button"
                        key={room.id}
                        className={`room-tile room-tile--${room.status} ${selected === room.id ? 'is-selected' : ''} ${matchesFilters(room, filters) ? '' : 'is-faded'}`}
                        title={`Room ${room.number} · ${meta.label}`}
                        aria-label={`Room ${room.number}, ${meta.label}`}
                        aria-pressed={selected === room.id}
                        onClick={() => onSelect(room.id)}
                      >
                        <b>{room.number}</b>
                        <Icon name={meta.icon} size={15} />
                      </button>
                    )
                  })}
                </div>
              ))}
            </section>
          </div>
        ))}
      </div>
    </div>
  )
}

function useRunAllocator() {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      const plan = await apiSend<{ proposal_id: string }>('/api/allocation/run', 'POST', {})
      await refreshApi(BOARD_PATH, '/api/decisions')
      router.push(`/rooms/plan/${plan.proposal_id}`)
    } catch (caught: unknown) {
      const nothing = caught instanceof ApiClientError && caught.code === 'nothing_to_plan'
      toast.show({ message: nothing ? 'Every guest already has a room or a suggestion.' : errorMessage(caught), tone: nothing ? 'info' : 'error' })
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}

export function RoomsScreen() {
  const timeZone = useTimeZone()
  const { data: board, error, isLoading, mutate } = useApi<RoomsBoard>(BOARD_PATH)
  const [selected, setSelected] = useState<string | null>(null)
  const [filters, setFilters] = useState<RoomFilters>({ wing: 'all', floor: 'all', status: 'all', query: '' })
  const [moving, setMoving] = useState<BoardRoom | null>(null)
  const allocator = useRunAllocator()
  const layout = board ? buildingLayout(board.rooms) : null
  const room = board?.rooms.find((item) => item.id === selected)
  const set = (patch: Partial<RoomFilters>) => setFilters((current) => ({ ...current, ...patch }))
  const stay = moving?.stays[0]

  return (
    <main className="rooms-page">
      <header className="rooms-header">
        <div>
          <h1>Rooms</h1>
          <p>{board ? headerLine(board) : 'Loading…'}</p>
        </div>
        <Button kind="primary" icon="sparkle" busy={allocator.busy} onClick={() => void allocator.run()}>
          Run allocator
        </Button>
      </header>
      <nav className="rooms-tabs" aria-label="Rooms">
        <button type="button" className="is-active" aria-current="page">
          Overview
        </button>
        {board?.pending_plan_id ? (
          <Link href={`/rooms/plan/${board.pending_plan_id}`} className="rooms-tab-link">
            Allocation plan
          </Link>
        ) : null}
      </nav>
      {error ? <ErrorBanner className="rooms-error" message={errorMessage(error)} onRetry={() => void mutate()} /> : null}
      <div className="rooms-summary rooms-summary--seven">
        {ROOM_STATUSES.map((status: RoomBoardStatus) => (
          <button type="button" key={status} className={`room-summary room-summary--${status} ${filters.status === status ? 'is-selected' : ''}`} aria-pressed={filters.status === status} onClick={() => set({ status: filters.status === status ? 'all' : status })}>
            <span>
              <Icon name={STATUS_META[status].icon} size={18} />
            </span>
            <div>
              <b>{board?.counts[status] ?? '–'}</b>
              <small>{STATUS_META[status].label}</small>
            </div>
          </button>
        ))}
      </div>
      <div className="rooms-filters">
        <label className="room-select">
          <select value={filters.wing} onChange={(event) => set({ wing: event.target.value })} aria-label="Wing">
            <option value="all">All wings</option>
            {layout?.wings.map((wing) => (
              <option key={wing.name} value={wing.name}>
                {wing.name}
              </option>
            ))}
          </select>
          <Icon name="chevron" size={15} />
        </label>
        <label className="room-select">
          <select value={filters.floor} onChange={(event) => set({ floor: event.target.value })} aria-label="Floor">
            <option value="all">All floors</option>
            {layout?.floors.map((floor) => (
              <option key={floor} value={String(floor)}>
                Floor {floor}
              </option>
            ))}
          </select>
          <Icon name="chevron" size={15} />
        </label>
        <label className="rooms-search">
          <Icon name="search" size={18} />
          <input value={filters.query} onChange={(event) => set({ query: event.target.value })} placeholder="Room or guest" aria-label="Room or guest" />
        </label>
      </div>
      <section className="building-card" aria-busy={isLoading || undefined}>
        {isLoading && !board ? (
          <div className="rooms-loading">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} />
            ))}
          </div>
        ) : board && board.rooms.length === 0 ? (
          <div className="room-inspector room-inspector--empty">
            <Icon name="bed" />
            <span>No rooms yet. An admin adds them in Settings → Rooms (or imports a CSV).</span>
          </div>
        ) : board ? (
          <>
            <Inspector room={room} timeZone={timeZone} onMove={setMoving} />
            <Building rooms={board.rooms} filters={filters} selected={selected} onSelect={setSelected} />
          </>
        ) : null}
      </section>
      {moving && stay && board ? <MoveDialog guest={{ id: stay.guest_id, name: stay.name }} rooms={roomChoices(board.rooms)} onClose={() => setMoving(null)} /> : null}
    </main>
  )
}
