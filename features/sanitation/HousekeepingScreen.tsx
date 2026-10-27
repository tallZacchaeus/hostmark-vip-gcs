'use client'
// The housekeeping phone (03-App-Flow.md /staff/sanitation, Figma "Staff sanitation", FR-CL-05):
// rooms to clean in priority order, one button that advances Start → Mark ready, problem reports,
// and today's cleaned rooms. New check-outs arrive live through the notification stream.
import { useId, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { useSession, useTimeZone } from '@/components/shell/SessionContext'
import { errorMessage } from '@/lib/client/api'
import { formatLongDay, formatTime, initials } from '@/lib/client/format'
import { signOut } from '@/lib/client/session-actions'
import { useApi } from '@/lib/client/use-api'
import type { CleaningItem, CleaningProblem, CleaningView } from '@/lib/repositories/cleaning'
import { useCleaningActions } from './actions'
import { CLEANING_PATH, PROBLEMS, statusLabel } from './model'

const REFRESH_MS = 60_000

type Tab = 'tasks' | 'profile'

const TONE = { pending: 'needs', in_progress: 'progress', done: 'done' } as const
const BADGE_ICON = { pending: 'brush', in_progress: 'loader', done: 'check' } as const

function timeLine(item: CleaningItem, timeZone: string): string {
  if (item.status === 'done') return `Marked ready ${formatTime(item.completed_at ?? item.ready_by, timeZone)}`
  if (item.status === 'in_progress') return `Started ${formatTime(item.started_at ?? item.ready_by, timeZone)}`
  return item.needed_by ? `Needed by ${formatTime(item.needed_by, timeZone)}` : 'No deadline'
}

interface TaskCardProps {
  readonly item: CleaningItem
  readonly timeZone: string
  readonly busy: boolean
  readonly onStart: () => void
  readonly onReady: () => void
  readonly onReport: () => void
}

function TaskCard({ item, timeZone, busy, onStart, onReady, onReport }: TaskCardProps) {
  const tone = TONE[item.status]
  const done = item.status === 'done'
  const progress = item.status === 'in_progress'
  return (
    <article className={`staff-task-card is-${tone}`} aria-label={`Room ${item.room_number}`}>
      <div className="staff-task-head">
        <div>
          <h2>Room {item.room_number}</h2>
          <p>
            {item.wing} wing · {item.room_type}
          </p>
        </div>
        <span className={`staff-task-badge is-${tone}`}>
          <Icon name={BADGE_ICON[item.status]} size={14} />
          {statusLabel(item)}
        </span>
      </div>
      <div className={`staff-task-time ${!done && !progress && !item.needed_by ? 'is-neutral' : ''}`}>
        <Icon name="clock" size={16} />
        {timeLine(item, timeZone)}
        {item.late_by_min > 0 && !done ? ` · ${item.late_by_min} min late` : ''}
      </div>
      {!done ? (
        <>
          <button type="button" className={`staff-task-action ${progress ? 'is-ready' : 'is-start'}`} disabled={busy} onClick={progress ? onReady : onStart}>
            <Icon name={progress ? 'check' : 'spray'} />
            {progress ? 'Mark ready' : 'Start cleaning'}
          </button>
          <button type="button" className="staff-task-report" onClick={onReport}>
            {item.problem_kind ? 'Problem reported · update' : 'Report a problem'}
          </button>
        </>
      ) : null}
    </article>
  )
}

function ReadySheet({ item, busy, onConfirm, onClose }: { readonly item: CleaningItem; readonly busy: boolean; readonly onConfirm: () => void; readonly onClose: () => void }) {
  const titleId = useId()
  return (
    <Modal onClose={onClose} scrimClassName="staff-sheet-scrim" className="staff-ready-sheet" labelledBy={titleId}>
      <i className="sheet-grab" />
      <h2 id={titleId}>Room {item.room_number} is ready?</h2>
      <p>It becomes available for check-in.</p>
      <button type="button" className="staff-ready-confirm" disabled={busy} onClick={onConfirm}>
        <Icon name="check" />
        Mark ready
      </button>
      <button type="button" className="staff-sheet-cancel" onClick={onClose}>
        Not yet
      </button>
    </Modal>
  )
}

interface ReportSheetProps {
  readonly item: CleaningItem
  readonly busy: boolean
  readonly onSend: (kind: CleaningProblem, note: string) => void
  readonly onClose: () => void
}

function ReportSheet({ item, busy, onSend, onClose }: ReportSheetProps) {
  const titleId = useId()
  const [kind, setKind] = useState<CleaningProblem | null>(null)
  const [note, setNote] = useState('')
  return (
    <Modal onClose={onClose} scrimClassName="staff-sheet-scrim" className="staff-report-sheet" labelledBy={titleId}>
      <i className="sheet-grab" />
      <h2 id={titleId}>Report a problem</h2>
      <p>
        Room {item.room_number} · {item.wing} wing
      </p>
      <div className="staff-problem-options" role="radiogroup" aria-label="What is the problem?">
        {PROBLEMS.map((option) => (
          <button type="button" role="radio" aria-checked={kind === option.kind} key={option.kind} className={kind === option.kind ? 'is-selected' : ''} onClick={() => setKind(option.kind)}>
            <Icon name={option.icon} />
            <span>{option.label}</span>
            {kind === option.kind ? <Icon name="check" size={18} /> : null}
          </button>
        ))}
      </div>
      <label className="staff-problem-note">
        <span>Add a note (optional)</span>
        <textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} rows={3} />
      </label>
      <button type="button" className="staff-report-send" disabled={!kind || busy} onClick={() => kind && onSend(kind, note)}>
        Send report
      </button>
      <button type="button" className="staff-sheet-cancel" onClick={onClose}>
        Cancel
      </button>
    </Modal>
  )
}

function Profile() {
  const { user, event } = useSession()
  return (
    <section className="staff-profile-card">
      <span>{initials(user.fullName)}</span>
      <h2>{user.fullName}</h2>
      <p>Housekeeping{event ? ` · ${event.venue_name}` : ''}</p>
      <button type="button" onClick={() => void signOut()}>
        <Icon name="logOut" />
        Sign out
      </button>
    </section>
  )
}

function Summary({ data }: { readonly data: CleaningView }) {
  const { not_started: toClean, in_progress: inProgress, done_today: done } = data.summary
  const total = Math.max(1, toClean + inProgress + done)
  return (
    <>
      <section className="staff-summary" aria-label="Today">
        <div>
          <b>{toClean}</b>
          <span>to clean</span>
        </div>
        <div>
          <b>{inProgress}</b>
          <span>in progress</span>
        </div>
        <div>
          <b>{done}</b>
          <span>done today</span>
        </div>
      </section>
      <div className="staff-progress" aria-hidden="true">
        <progress className="is-blue" max={total} value={done + inProgress} />
        <progress className="is-green" max={total} value={done} />
      </div>
    </>
  )
}

export function HousekeepingScreen() {
  const timeZone = useTimeZone()
  const [tab, setTab] = useState<Tab>('tasks')
  const [readyItem, setReadyItem] = useState<CleaningItem | null>(null)
  const [reportItem, setReportItem] = useState<CleaningItem | null>(null)
  const { data, error } = useApi<CleaningView>(CLEANING_PATH, { refreshInterval: REFRESH_MS })
  const actions = useCleaningActions()
  const items = data ? [...data.queue, ...data.done] : []

  return (
    <main className="staff-sanitation-page">
      <div className="driver-phone-frame staff-sanitation-frame">
        <div className="staff-sanitation-content">
          <header className="staff-sanitation-header">
            <h1>Sanitation</h1>
            <p>{data ? formatLongDay(`${data.day}T12:00:00Z`, 'UTC') : ' '}</p>
          </header>
          {error ? (
            <div className="staff-sanitation-offline" role="alert">
              <Icon name="wifiOff" />
              <span>{data ? "You're offline. Showing your last update." : errorMessage(error)}</span>
            </div>
          ) : null}
          {tab === 'profile' ? (
            <Profile />
          ) : data ? (
            <>
              <Summary data={data} />
              {items.length === 0 ? (
                <div className="staff-sanitation-empty">
                  <span>
                    <Icon name="sparkle" size={38} />
                  </span>
                  <h2>All rooms are ready. Nice work.</h2>
                  <p>New rooms appear here after check-out.</p>
                </div>
              ) : (
                <section className="staff-task-list" aria-label="Rooms to clean">
                  {items.map((item) => (
                    <TaskCard
                      key={item.task_id}
                      item={item}
                      timeZone={timeZone}
                      busy={actions.busy}
                      onStart={() => void actions.start(item)}
                      onReady={() => setReadyItem(item)}
                      onReport={() => setReportItem(item)}
                    />
                  ))}
                </section>
              )}
            </>
          ) : null}
        </div>
        <nav className="driver-tabbar staff-sanitation-tabbar" aria-label="Housekeeping">
          <button type="button" className={tab === 'tasks' ? 'is-active' : ''} aria-current={tab === 'tasks' ? 'page' : undefined} onClick={() => setTab('tasks')}>
            <Icon name="spray" />
            <span>Tasks</span>
          </button>
          <button type="button" className={tab === 'profile' ? 'is-active' : ''} aria-current={tab === 'profile' ? 'page' : undefined} onClick={() => setTab('profile')}>
            <Icon name="user" />
            <span>Profile</span>
          </button>
        </nav>
        {readyItem ? (
          <ReadySheet item={readyItem} busy={actions.busy} onClose={() => setReadyItem(null)} onConfirm={() => void actions.complete(readyItem).then(() => setReadyItem(null))} />
        ) : null}
        {reportItem ? (
          <ReportSheet
            item={reportItem}
            busy={actions.busy}
            onClose={() => setReportItem(null)}
            onSend={(kind, note) => void actions.report(reportItem, kind, note).then((sent) => sent && setReportItem(null))}
          />
        ) : null}
      </div>
    </main>
  )
}
