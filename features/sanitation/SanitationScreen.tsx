'use client'
// Sanitation (03-App-Flow.md /sanitation, Figma "Sanitation", FR-CL-03/04/06): the coordinator's
// view of the cleaning queue in priority order — when each room was checked out, its live ready
// estimate against when it is needed, problems housekeeping reported — and "Reverse check-out"
// for a mistaken check-out that housekeeping has not started on.
import { useId, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/Feedback'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { Badge, Skeleton } from '@/components/ui/Status'
import { useTimeZone } from '@/components/shell/SessionContext'
import { errorMessage } from '@/lib/client/api'
import { formatTime } from '@/lib/client/format'
import { refreshApi, useApi } from '@/lib/client/use-api'
import type { CleaningItem, CleaningView } from '@/lib/repositories/cleaning'
import { useCleaningActions } from './actions'
import { CLEANING_PATH, lateText, problemLabel } from './model'

const REFRESH_MS = 30_000
const SKELETON_ROWS = 5

type Tab = 'queue' | 'done'

function Summary({ data }: { readonly data: CleaningView | undefined }) {
  const items: readonly { value: number; label: string; icon: IconName; tone: string }[] = [
    { value: data?.summary.not_started ?? 0, label: 'Not started', icon: 'brush', tone: 'waiting' },
    { value: data?.summary.in_progress ?? 0, label: 'In progress', icon: 'loader', tone: 'cleaning' },
    { value: data?.summary.done_today ?? 0, label: 'Clean today', icon: 'check', tone: 'done' },
  ]
  return (
    <div className="sanitation-summary">
      {items.map((item) => (
        <div className={`sanitation-stat sanitation-stat--${item.tone}`} key={item.label}>
          <span>
            <Icon name={item.icon} />
          </span>
          <div>
            <b>{item.value}</b>
            <small>{item.label}</small>
          </div>
        </div>
      ))}
    </div>
  )
}

interface RowProps {
  readonly item: CleaningItem
  readonly first: boolean
  readonly last: boolean
  readonly timeZone: string
  readonly onReverse: () => void
}

function QueueRow({ item, first, last, timeZone, onReverse }: RowProps) {
  const late = lateText(item)
  const active = item.status === 'in_progress'
  return (
    <div className={`cleaning-row ${late ? 'is-late' : ''}`}>
      <div className={`cleaning-priority ${first ? 'is-first' : ''} ${last ? 'is-last' : ''}`}>
        <span className={active ? 'is-active' : late ? 'is-late' : ''} aria-label={`Priority ${item.priority}`}>
          {item.priority}
        </span>
      </div>
      <div className="cleaning-room">
        <b>{item.room_number}</b>
        <small>
          {item.room_type} · {item.wing}
        </small>
        {item.problem_kind ? (
          <Badge tone="warning" icon="wrench">
            {problemLabel(item.problem_kind)}
            {item.problem_note ? `: ${item.problem_note}` : ''}
          </Badge>
        ) : null}
      </div>
      <time className="checked-out">{formatTime(item.checked_out_at, timeZone)}</time>
      <div className="cleaning-status">
        <Badge tone={active ? 'info' : 'neutral'} icon={active ? 'loader' : undefined}>
          {active ? 'In progress' : 'Not started'}
        </Badge>
      </div>
      <div className="ready-estimate">
        <b>{formatTime(item.ready_by, timeZone)}</b>
        {late ? (
          <Badge tone="warning" icon="alert">
            {late}
          </Badge>
        ) : null}
      </div>
      <time className="needed-by">{item.needed_by ? formatTime(item.needed_by, timeZone) : '—'}</time>
      <div className="cleaning-action">
        {item.status === 'pending' ? (
          <button type="button" onClick={onReverse}>
            Reverse check-out
          </button>
        ) : null}
      </div>
    </div>
  )
}

function ReverseDialog({ item, busy, onClose, onReverse }: { readonly item: CleaningItem; readonly busy: boolean; readonly onClose: () => void; readonly onReverse: () => void }) {
  const titleId = useId()
  return (
    <Modal onClose={onClose} scrimClassName="reverse-dialog-scrim" className="reverse-dialog" labelledBy={titleId}>
      <h2 id={titleId}>Reverse this check-out?</h2>
      <p>The guests are checked in again and the room goes back to Occupied.</p>
      <div>
        <b>Room {item.room_number}</b>
        <span>
          {item.room_type} · {item.wing}
        </span>
      </div>
      <footer>
        <Button onClick={onClose}>Cancel</Button>
        <button type="button" disabled={busy} onClick={onReverse}>
          Reverse
        </button>
      </footer>
    </Modal>
  )
}

function QueueTable({ data, timeZone, onReverse }: { readonly data: CleaningView | undefined; readonly timeZone: string; readonly onReverse: (item: CleaningItem) => void }) {
  if (!data) {
    return (
      <div className="cleaning-loading">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} />
        ))}
      </div>
    )
  }
  if (data.queue.length === 0) {
    return (
      <div className="cleaning-empty">
        <span>
          <Icon name="sparkle" size={26} />
        </span>
        <h2>No rooms are waiting. Everything is clean.</h2>
        <p>New check-outs appear here as they happen.</p>
      </div>
    )
  }
  return (
    <>
      <div className="cleaning-table-head" aria-hidden="true">
        <span>Priority</span>
        <span>Room</span>
        <span>Checked out</span>
        <span>Status</span>
        <span>Ready by (estimate)</span>
        <span>Needed by</span>
        <span>Action</span>
      </div>
      <div>
        {data.queue.map((item, index) => (
          <QueueRow key={item.task_id} item={item} first={index === 0} last={index === data.queue.length - 1} timeZone={timeZone} onReverse={() => onReverse(item)} />
        ))}
      </div>
    </>
  )
}

function DoneToday({ data, timeZone }: { readonly data: CleaningView | undefined; readonly timeZone: string }) {
  const done = data?.done ?? []
  return (
    <section className="sanitation-done">
      <span>
        <Icon name="check" size={26} />
      </span>
      <h2>
        {done.length} {done.length === 1 ? 'room' : 'rooms'} cleaned today
      </h2>
      <p>
        {done.length > 0
          ? done.map((item) => `${item.room_number} at ${formatTime(item.completed_at ?? item.ready_by, timeZone)}`).join(' · ')
          : 'Cleaned rooms move here once housekeeping marks them ready.'}
      </p>
    </section>
  )
}

export function SanitationScreen() {
  const timeZone = useTimeZone()
  const [tab, setTab] = useState<Tab>('queue')
  const [reversing, setReversing] = useState<CleaningItem | null>(null)
  const { data, error } = useApi<CleaningView>(CLEANING_PATH, { refreshInterval: REFRESH_MS })
  const actions = useCleaningActions()

  return (
    <main className="sanitation-page">
      <header className="sanitation-header">
        <h1>Sanitation</h1>
        <p>Rooms waiting to be cleaned, in priority order.</p>
      </header>
      <Summary data={data} />
      <div className="sanitation-tabs" role="tablist" aria-label="Sanitation">
        {(
          [
            ['queue', 'Queue'],
            ['done', 'Done today'],
          ] as const
        ).map(([value, label]) => (
          <button type="button" role="tab" key={value} aria-selected={tab === value} className={tab === value ? 'is-active' : ''} onClick={() => setTab(value)}>
            {label}
          </button>
        ))}
      </div>
      {error && tab === 'queue' ? (
        <ErrorBanner
          className="sanitation-error"
          message={data ? "We couldn't refresh the cleaning queue. Showing the last update." : errorMessage(error)}
          onRetry={() => void refreshApi(CLEANING_PATH)}
        />
      ) : null}
      {tab === 'done' ? (
        <DoneToday data={data} timeZone={timeZone} />
      ) : (
        <section className="cleaning-card" aria-label="Cleaning queue">
          <QueueTable data={data} timeZone={timeZone} onReverse={setReversing} />
        </section>
      )}
      {reversing ? (
        <ReverseDialog item={reversing} busy={actions.busy} onClose={() => setReversing(null)} onReverse={() => void actions.reverse(reversing).then(() => setReversing(null))} />
      ) : null}
    </main>
  )
}
