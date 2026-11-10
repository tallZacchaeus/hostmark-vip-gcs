'use client'
// Review submission (03-App-Flow.md /intake/[id], FR-IN-10, F2–F3): the original beside what was
// read, every check's result, the duplicate comparison, then approve, link or reject.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/Feedback'
import { Field, FormDialog } from '@/components/ui/FormDialog'
import { Icon } from '@/components/ui/Icon'
import { Pill, Skeleton } from '@/components/ui/Status'
import { useToast } from '@/components/ui/Toast'
import { useTimeZone } from '@/components/shell/SessionContext'
import type { VipCategory } from '@/features/settings/types'
import { ApiClientError, apiSend } from '@/lib/client/api'
import { formatDayTime } from '@/lib/client/format'
import { refreshApi, useApi } from '@/lib/client/use-api'
import { useAction } from '@/lib/client/use-action'
import type { LinkUpdate } from '@/lib/domain/intake/link-updates'
import { type DelegationSummary, DuplicateComparison } from './DuplicateComparison'
import {
  ARRIVAL_MODE_LABELS,
  type ExtractedItem,
  type IntakeFields,
  type IntakeIssue,
  REQUIREMENT_LABELS,
  SUBMISSION_STATUS,
  type SubmissionStatus,
  completeFields,
  fieldMessages,
  guestName,
} from './model'
import { ReviewForm } from './ReviewForm'

interface SubmissionDetail {
  readonly id: string
  readonly reference_code: string
  readonly source: 'form' | 'pasted_message'
  readonly status: SubmissionStatus
  readonly submitted_at: string
  readonly payload: { readonly text?: string } & Partial<IntakeFields>
  readonly normalized: Partial<IntakeFields> | null
  readonly extraction: { readonly items: ExtractedItem[]; readonly method: string; readonly error: string | null } | null
  readonly issues: IntakeIssue[]
  readonly duplicate_kind: 'none' | 'exact' | 'likely'
  readonly delegation_id: string | null
  readonly ai_model: string | null
  readonly review_note: string | null
  readonly reviewed_at: string | null
  readonly reviewed_by_name: string | null
  readonly created_by_name: string | null
  readonly matched: DelegationSummary | null
}

interface Decided {
  readonly delegation_id: string
  readonly principal_guest_id: string | null
  /** Link only: which ticked updates changed the existing delegation. */
  readonly applied?: readonly LinkUpdate[]
}

function OriginalSubmission({ submission }: { readonly submission: SubmissionDetail }) {
  const form = submission.payload
  return (
    <section className="review-card original-message-card" aria-labelledby="original-title">
      <header>
        <h2 id="original-title">{submission.source === 'pasted_message' ? 'Original message' : 'What the guest sent'}</h2>
        <span>Read only</span>
      </header>
      {submission.source === 'pasted_message' ? (
        <p className="original-text">{form.text}</p>
      ) : (
        <dl className="original-form">
          {(
            [
              ['Name', guestName(form.title, form.full_name)],
              ['Organisation', form.organisation],
              ['Contact', [form.contact_name, form.contact_email, form.contact_phone].filter(Boolean).join(' · ')],
              ['Arriving', form.arrival_mode ? ARRIVAL_MODE_LABELS[form.arrival_mode] : ''],
              ['Flight', [form.airline, form.flight_number].filter(Boolean).join(' ')],
              ['Arrival', [form.arrival_date, form.arrival_time].filter(Boolean).join(' ')],
              ['Pickup', form.pickup_address],
              ['Departure', form.departure_date],
              ['Party', form.party?.length ? form.party.map((member) => member.name || member.role).join(', ') : ''],
              ['Dietary', form.dietary],
              ['Accessibility', form.accessibility],
              ['Anything else', form.others],
            ] as const
          )
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>
      )}
    </section>
  )
}

function ChecksList({ issues, items, readerError }: { readonly issues: IntakeIssue[]; readonly items: ExtractedItem[]; readonly readerError: string | null }) {
  // Field problems are shown on the field itself; here only what has no field in the form.
  // Field problems show on the field and flagged note items as cards below; list only the rest.
  const general = issues.filter((issue) => (!issue.field || issue.field === 'others') && issue.code !== 'others_needs_attention' && issue.code !== 'others_conflict')
  const flagged = items.filter((item) => item.needs_attention || item.conflicts_with)
  const plain = items.filter((item) => !item.needs_attention && !item.conflicts_with)
  if (general.length === 0 && items.length === 0 && !readerError) return null
  return (
    <div className="review-checks">
      {general.length > 0 && (
        <ul className="review-issues" aria-label="Checks">
          {general.map((issue) => (
            <li key={`${issue.code}-${issue.message}`} className={`is-${issue.severity}`}>
              <Icon name={issue.severity === 'info' ? 'info' : 'alert'} size={16} />
              {issue.message}
            </li>
          ))}
        </ul>
      )}
      {flagged.map((item) => (
        <div className="uncertain-review" key={item.detail}>
          <div>
            <Icon name="alert" />
            <b>
              {item.conflicts_with ? `Contradicts the ${item.conflicts_with.replace(/_/g, ' ')}` : 'Needs attention'}: {item.detail}
            </b>
          </div>
          <small>Saved to the guest&apos;s open issues on approval ({REQUIREMENT_LABELS[item.category]}).</small>
        </div>
      ))}
      {plain.length > 0 && (
        <p className="review-items">
          Also read: {plain.map((item) => `${REQUIREMENT_LABELS[item.category]}: ${item.detail}`).join(' · ')}
        </p>
      )}
    </div>
  )
}

function ReviewWorkspace({ submission, onChanged }: { readonly submission: SubmissionDetail; readonly onChanged: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const timeZone = useTimeZone()
  const [fields, setFields] = useState<IntakeFields>(() => completeFields(submission.normalized))
  const [issues, setIssues] = useState<IntakeIssue[]>(submission.issues)
  const [dirty, setDirty] = useState(false)
  const [compare, setCompare] = useState(submission.duplicate_kind !== 'none' && submission.matched !== null)
  const [categoryId, setCategoryId] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [note, setNote] = useState('')
  const [apply, setApply] = useState<readonly LinkUpdate[]>([])
  const toggleApply = (update: LinkUpdate) =>
    setApply((current) => (current.includes(update) ? current.filter((item) => item !== update) : [...current, update]))
  const categories = useApi<VipCategory[]>('/api/admin/vip-categories?limit=200')
  const action = useAction()
  const open = submission.status === 'needs_review'
  const matched = submission.matched
  const status = SUBMISSION_STATUS[submission.status]
  const toCheck = issues.filter((issue) => issue.severity !== 'info').length
  const base = `/api/intake/submissions/${submission.id}`

  const finish = (message: string, decided: Decided | null) => {
    void refreshApi('/api/intake', '/api/guests', '/api/dashboard')
    const guestId = decided?.principal_guest_id
    toast.show({ message, action: guestId ? { label: 'Open guest profile', run: () => router.push(`/guests/${guestId}`) } : undefined })
    onChanged()
  }
  const onEdit = (next: IntakeFields) => {
    setFields(next)
    setDirty(true)
  }
  const save = () =>
    action.run(async () => {
      const result = await apiSend<{ issues: IntakeIssue[] }>(base, 'PATCH', { fields })
      setIssues(result.issues)
      setDirty(false)
      toast.show({ message: 'Saved and checked again' })
    })
  const approve = () =>
    action.run(async () => {
      try {
        const records = await apiSend<Decided>(`${base}/approve`, 'POST', { fields, ...(categoryId ? { vip_category_id: categoryId } : {}) })
        finish('Delegation created', records)
      } catch (error: unknown) {
        if (error instanceof ApiClientError && error.code === 'intake_incomplete' && Array.isArray(error.details)) {
          setCompare(false)
          setIssues((current) => [...current.filter((issue) => issue.severity !== 'error'), ...(error.details as IntakeIssue[])])
        }
        throw error
      }
    })
  const link = () =>
    action.run(async () => {
      if (!matched) return
      const decided = await apiSend<Decided>(`${base}/link`, 'POST', { delegation_id: matched.delegation_id, apply })
      finish(decided.applied?.length ? 'Linked; the existing delegation was updated' : 'Linked to the existing delegation', decided)
    })
  const reject = () =>
    action.run(async () => {
      await apiSend(`${base}/reject`, 'POST', { note })
      setRejecting(false)
      finish('Submission rejected', null)
    })
  const undoAuto = () =>
    action.run(async () => {
      await apiSend(`${base}/undo`, 'POST', {})
      setUndoing(false)
      finish('Automatic processing undone; the submission is back in review', null)
    })

  return (
    <main className="review-page-v4">
      <Link className="review-breadcrumb" href="/intake">
        Intake <Icon name="arrow" size={14} />
        <span>{submission.reference_code}</span>
      </Link>
      <header className="review-header">
        <h1>{open ? 'Review submission' : guestName(fields.title, fields.full_name)}</h1>
        <div>
          <Pill tone="neutral">{submission.source === 'form' ? 'Registration form' : 'Pasted message'}</Pill>
          <Pill tone={status.tone}>{status.label}</Pill>
          {submission.duplicate_kind === 'likely' && <Pill tone="info">Likely duplicate</Pill>}
          {open && toCheck > 0 && <Pill tone="warning">{`${toCheck} ${toCheck === 1 ? 'issue' : 'issues'} to check`}</Pill>}
        </div>
      </header>
      {submission.extraction?.error && <ErrorBanner className="review-error" message="We couldn't read the free text with the AI. A basic reader was used; check the details by hand." />}
      {action.error && <ErrorBanner className="review-error" message={action.error} />}
      {!open && (
        <p className="review-decided">
          {status.label}
          {submission.reviewed_by_name ? ` by ${submission.reviewed_by_name}` : ''}
          {submission.reviewed_at ? `, ${formatDayTime(submission.reviewed_at, timeZone)}` : ''}.{submission.review_note ? ` Note: ${submission.review_note}` : ''}
        </p>
      )}
      {matched && !compare && (
        <div className="possible-match">
          <Icon name="info" />
          <span>
            Possible match: {matched.delegation_name}
            {matched.reference_code ? ` (${matched.reference_code})` : ''}.
          </span>
          <Button onClick={() => setCompare(true)}>Compare</Button>
        </div>
      )}
      {matched && compare ? (
        <>
          <DuplicateComparison existing={matched} incoming={fields} timeZone={timeZone} choices={open ? { chosen: apply, onToggle: toggleApply } : undefined} />
          <p className="review-switch">
            <button type="button" onClick={() => setCompare(false)}>
              Show the full submission
            </button>
          </p>
        </>
      ) : (
        <div className="review-panes-v4">
          <OriginalSubmission submission={submission} />
          <section className="review-card what-read-card" aria-labelledby="read-title">
            <header>
              <h2 id="read-title">{open ? 'What was read' : 'Details'}</h2>
              {submission.ai_model && <span>{submission.ai_model === 'rules' ? 'Basic reader' : 'Read by AI'}</span>}
            </header>
            <ChecksList issues={issues} items={submission.extraction?.items ?? []} readerError={submission.extraction?.error ?? null} />
            {open && (
              <div className="review-base-fields">
                <div>
                  <label className="review-field">
                    <span>VIP category (set by you, never by the guest)</span>
                    <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                      <option value="">Decide later</option>
                      {(categories.data ?? []).map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}
            <ReviewForm fields={fields} onChange={onEdit} messages={fieldMessages(issues)} readOnly={!open} />
          </section>
        </div>
      )}
      <div className="review-sticky-footer">
        {open ? (
          <>
            <span>{compare ? 'Nothing is merged automatically.' : 'No guest is created until you approve.'}</span>
            <div>
              {matched && (
                <Button kind={compare ? 'primary' : 'secondary'} onClick={link} disabled={action.busy}>
                  Link to existing
                </Button>
              )}
              <button type="button" className="footer-reject" onClick={() => setRejecting(true)} disabled={action.busy}>
                Reject
              </button>
              {dirty && !compare && (
                <Button onClick={save} busy={action.busy}>
                  Save changes
                </Button>
              )}
              <Button kind={compare ? 'secondary' : 'primary'} onClick={approve} busy={action.busy}>
                {compare ? 'Treat as new' : 'Approve and create'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <span>This submission has been decided.</span>
            <div>
              {submission.status === 'auto_processed' && (
                <button type="button" className="footer-reject" onClick={() => setUndoing(true)} disabled={action.busy}>
                  Undo automatic processing
                </button>
              )}
              {submission.delegation_id && (
                <Link className="hm-button hm-button--primary" href={`/guests/${submission.delegation_id}`}>
                  <span>Open guest profile</span>
                </Link>
              )}
            </div>
          </>
        )}
      </div>
      {undoing && (
        <FormDialog
          title="Undo automatic processing?"
          description="The delegation, its guests, arrival and pickup created from this registration are removed, and the submission goes back to Needs review."
          submitLabel="Undo"
          danger
          busy={action.busy}
          error={action.error}
          onSubmit={undoAuto}
          onClose={() => setUndoing(false)}
        />
      )}
      {rejecting && (
        <FormDialog title="Reject this submission?" description="It stays in Activity. No guest is created." submitLabel="Reject" danger busy={action.busy} error={action.error} onSubmit={reject} onClose={() => setRejecting(false)}>
          <Field label="Note (optional)">
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={2000} />
          </Field>
        </FormDialog>
      )}
    </main>
  )
}

export function ReviewScreen({ id }: { readonly id: string }) {
  const { data, error, mutate } = useApi<SubmissionDetail>(`/api/intake/submissions/${id}`)
  if (error && !data) {
    return (
      <main className="review-page-v4">
        <Link className="review-breadcrumb" href="/intake">
          Intake <Icon name="arrow" size={14} />
        </Link>
        <ErrorBanner className="review-error" message={error instanceof ApiClientError && error.status === 404 ? 'This submission does not exist.' : "We couldn't load this submission."} onRetry={() => void mutate()} />
      </main>
    )
  }
  if (!data) {
    return (
      <main className="review-page-v4" aria-busy="true">
        <div className="review-loading">
          {[0, 1].map((index) => (
            <section className="review-card" key={index}>
              <Skeleton className="review-sk-title" />
              <Skeleton className="review-sk-line" />
              <Skeleton className="review-sk-line" />
              <Skeleton className="review-sk-block" />
            </section>
          ))}
        </div>
      </main>
    )
  }
  return <ReviewWorkspace key={`${data.id}:${data.status}`} submission={data} onChanged={() => void mutate()} />
}
