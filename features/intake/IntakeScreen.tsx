'use client'
// Intake (03-App-Flow.md /intake, FR-IN-10): registrations and pasted messages that need a
// person, grouped by reason; paste a message; copy the shared registration link.
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Pill, Skeleton } from '@/components/ui/Status'
import { useToast } from '@/components/ui/Toast'
import { useTimeZone } from '@/components/shell/SessionContext'
import { useNow } from '@/components/shell/useNow'
import { dateKey, formatShortDay, formatTime } from '@/lib/client/format'
import { withQuery } from '@/lib/client/api'
import { useApi } from '@/lib/client/use-api'
import { useDebouncedValue } from '@/lib/client/use-debounced-value'
import { type IntakeIssue, SUBMISSION_STATUS, type SubmissionStatus, guestName, reasonsOf } from './model'
import { PasteMessageDrawer } from './PasteMessageDrawer'

const TABS = [
  ['review', 'Needs review'],
  ['duplicates', 'Likely duplicates'],
  ['missing', 'Missing details'],
  ['flagged', 'Flagged'],
  ['processed', 'Processed'],
] as const

type Tab = (typeof TABS)[number][0]

export interface SubmissionRow {
  readonly id: string
  readonly reference_code: string
  readonly source: 'form' | 'pasted_message'
  readonly status: SubmissionStatus
  readonly submitted_at: string
  readonly duplicate_kind: 'none' | 'exact' | 'likely'
  readonly issues: IntakeIssue[]
  readonly delegation_id: string | null
  readonly title: string
  readonly full_name: string
}

interface SubmissionList {
  readonly rows: SubmissionRow[]
  readonly tabs: Record<Tab | 'rejected', number>
  readonly link: { readonly token: string; readonly open: boolean } | null
}

const PAGE_SIZE = 100

function EmptyQueue({ tab, onPaste }: { readonly tab: Tab; readonly onPaste: () => void }) {
  if (tab === 'flagged') {
    return (
      <div className="intake-empty">
        <span>
          <Icon name="shield" />
        </span>
        <h2>Nothing flagged.</h2>
      </div>
    )
  }
  return (
    <div className="intake-empty">
      <span className="intake-empty-icon">
        <Icon name="inbox" />
        <Icon name="check" size={12} />
      </span>
      <h2>{tab === 'processed' ? 'Nothing processed yet.' : 'No submissions to review.'}</h2>
      {tab !== 'processed' && (
        <Button kind="primary" icon="clipboard" onClick={onPaste}>
          Paste a message
        </Button>
      )}
    </div>
  )
}

/** "13:25" today, "Mon 19 Oct" before (the column is narrow; the review screen has the detail). */
function receivedLabel(iso: string, timeZone: string, now: Date | null): string {
  const today = now ? dateKey(now, timeZone) : null
  return !today || dateKey(iso, timeZone) === today ? formatTime(iso, timeZone) : formatShortDay(iso, timeZone)
}

function QueueRow({ row, timeZone, now }: { readonly row: SubmissionRow; readonly timeZone: string; readonly now: Date | null }) {
  const reasons = row.status === 'needs_review' ? reasonsOf(row.issues, row.duplicate_kind) : [SUBMISSION_STATUS[row.status]]
  return (
    <div className="intake-table-row">
      <b>{row.reference_code}</b>
      <time dateTime={row.submitted_at}>{receivedLabel(row.submitted_at, timeZone, now)}</time>
      <span className="intake-source">
        <Icon name={row.source === 'form' ? 'file' : 'message'} />
        {row.source === 'form' ? 'Registration form' : 'Pasted message'}
      </span>
      <span>{guestName(row.title, row.full_name)}</span>
      <span className="intake-reasons">
        {reasons.map((reason) => (
          <Pill key={reason.label} tone={reason.tone}>
            {reason.label}
          </Pill>
        ))}
      </span>
      <Link className="hm-button hm-button--secondary" href={`/intake/${row.id}`} aria-label={`Review ${row.reference_code}`}>
        <span>{row.status === 'needs_review' ? 'Review' : 'Open'}</span>
      </Link>
    </div>
  )
}

export function IntakeScreen() {
  const timeZone = useTimeZone()
  const now = useNow()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('review')
  const [search, setSearch] = useState('')
  const [source, setSource] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const query = useDebouncedValue(search.trim())
  const { data, meta, error, isLoading, mutate } = useApi<SubmissionList>(withQuery('/api/intake/submissions', { tab, search: query, source, limit: PAGE_SIZE }))

  const copyLink = async () => {
    if (!data?.link) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/register/${data.link.token}`)
      toast.show({ message: data.link.open ? 'Registration link copied' : 'Registration link copied. The link is closed: open it in Settings → System.' })
    } catch {
      toast.show({ message: 'Could not copy. Find the link in Settings → System.', tone: 'error' })
    }
  }

  return (
    <main className="intake-page">
      <header className="intake-header">
        <div>
          <h1>Intake</h1>
          <p>Registrations and messages that need a person to check them.</p>
        </div>
        <div>
          <Button kind="primary" icon="clipboard" onClick={() => setPasteOpen(true)}>
            Paste a message
          </Button>
          <Button icon="link" onClick={copyLink} disabled={!data?.link}>
            Copy registration link
          </Button>
        </div>
      </header>
      <div className="intake-tabs" role="tablist" aria-label="Submissions by reason">
        {TABS.map(([value, label]) => (
          <button role="tab" type="button" aria-selected={tab === value} className={tab === value ? 'is-active' : ''} key={value} onClick={() => setTab(value)}>
            <span>{label}</span>
            <b>{data?.tabs[value] ?? '–'}</b>
          </button>
        ))}
      </div>
      <div className="intake-filters">
        <label>
          <Icon name="search" size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference or name" aria-label="Search reference or name" />
        </label>
        <select className="filter-select" value={source} onChange={(event) => setSource(event.target.value)} aria-label="Source">
          <option value="">All sources</option>
          <option value="form">Registration form</option>
          <option value="pasted_message">Pasted message</option>
        </select>
      </div>
      {error ? <ErrorBanner className="intake-error" message="We couldn't load the intake queue." onRetry={() => void mutate()} /> : null}
      <section className="intake-table-card" aria-busy={isLoading || undefined}>
        <div className="intake-table-head" aria-hidden="true">
          <span>Reference</span>
          <span>Received</span>
          <span>Source</span>
          <span>Guest</span>
          <span>Reasons</span>
          <span />
        </div>
        {isLoading && !data ? (
          <div className="intake-loading">
            {[0, 1, 2, 3].map((index) => (
              <div key={index}>
                <Skeleton />
                <Skeleton />
                <Skeleton />
                <Skeleton />
                <Skeleton />
              </div>
            ))}
          </div>
        ) : data && data.rows.length > 0 ? (
          <div className="intake-table-body">
            {data.rows.map((row) => (
              <QueueRow key={row.id} row={row} timeZone={timeZone} now={now} />
            ))}
          </div>
        ) : data ? (
          <EmptyQueue tab={tab} onPaste={() => setPasteOpen(true)} />
        ) : null}
        {data && (
          <footer>
            {meta && meta.total > data.rows.length && `Showing the latest ${data.rows.length} of ${meta.total}. `}
            {data.tabs.processed} {data.tabs.processed === 1 ? 'submission was' : 'submissions were'} processed automatically or approved.{' '}
            <Link href="/activity">See them in Activity</Link>
          </footer>
        )}
      </section>
      {pasteOpen && <PasteMessageDrawer onClose={() => setPasteOpen(false)} />}
    </main>
  )
}
