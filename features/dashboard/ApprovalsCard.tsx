'use client'
// "Waiting for your approval" (FR-PL-09): open proposals with one-tap Approve / Reject. The server
// re-validates each proposal before acting, so a stale one fails safely with a clear message.
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/Feedback'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Skeleton, SuggestedChip } from '@/components/ui/Status'
import { useToast } from '@/components/ui/Toast'
import { useTimeZone } from '@/components/shell/SessionContext'
import { errorMessage } from '@/lib/client/api'
import { formatTime } from '@/lib/client/format'
import { decideProposal } from '@/lib/client/proposals'
import { refreshApi, useApi } from '@/lib/client/use-api'

export interface Decision {
  readonly id: string
  readonly kind: 'room_plan' | 'room_assignment' | 'driver_assignment' | 'driver_reassignment' | 'release_pickup' | 'copilot_action'
  readonly title: string
  readonly summary: string | null
  readonly rationale: { readonly reason?: string; readonly also_changes?: string } | null
  readonly created_at: string
  readonly expires_at: string | null
  readonly line_count: string | number | null
}

const KIND_ICONS: Readonly<Record<Decision['kind'], IconName>> = {
  room_plan: 'bed',
  room_assignment: 'bed',
  driver_assignment: 'car',
  driver_reassignment: 'repeat',
  release_pickup: 'x',
  copilot_action: 'sparkle',
}

export function reviewHref(decision: Pick<Decision, 'id' | 'kind'>): string {
  switch (decision.kind) {
    case 'room_plan':
      return `/rooms/plan/${decision.id}`
    case 'room_assignment':
      return '/rooms'
    case 'release_pickup':
      return '/arrivals'
    case 'copilot_action':
      return '/dashboard#approvals'
    default:
      return '/transport'
  }
}

const COLLAPSED_COUNT = 2

function ApprovalRow({ decision, busy, onDecide }: { readonly decision: Decision; readonly busy: boolean; readonly onDecide: (approve: boolean) => void }) {
  const timeZone = useTimeZone()
  const isPlan = decision.kind === 'room_plan'
  return (
    <div className="approval-row">
      <span className="approval-icon">
        <Icon name={KIND_ICONS[decision.kind]} />
      </span>
      <div className="approval-body">
        <div className="approval-heading">
          <b>{decision.title}</b>
          <SuggestedChip />
        </div>
        {decision.summary && <p>{decision.summary}</p>}
        {decision.rationale?.also_changes && <small>What else changes: {decision.rationale.also_changes}</small>}
      </div>
      <div className="approval-actions">
        <time dateTime={decision.created_at}>{formatTime(decision.created_at, timeZone)}</time>
        {isPlan ? (
          <Link className="hm-button hm-button--approve" href={reviewHref(decision)}>
            <span>Review plan</span>
          </Link>
        ) : (
          <div>
            <Button kind="approve" busy={busy} onClick={() => onDecide(true)}>
              Approve
            </Button>
            <Button kind="ghost" disabled={busy} onClick={() => onDecide(false)}>
              Reject
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export function ApprovalsCard() {
  const toast = useToast()
  const { data, meta, error, isLoading, mutate } = useApi<Decision[]>('/api/decisions?limit=50')
  const [expanded, setExpanded] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const decisions = data ?? []
  const visible = expanded ? decisions : decisions.slice(0, COLLAPSED_COUNT)
  const count = meta?.total ?? decisions.length

  const decide = async (decision: Decision, approve: boolean) => {
    setBusyId(decision.id)
    try {
      const outcome = await decideProposal(decision.id, decision.title, approve)
      toast.show({ message: outcome.message, tone: outcome.ok ? undefined : 'error' })
      await refreshApi('/api/decisions', '/api/dashboard', '/api/audit', '/api/transport', '/api/arrivals')
    } catch (caught: unknown) {
      toast.show({ message: errorMessage(caught), tone: 'error' })
      await mutate()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="card-v4 approvals-card" id="approvals" aria-labelledby="approvals-title">
      <header>
        <h2 id="approvals-title">
          Waiting for your approval <span>{count}</span>
        </h2>
      </header>
      {error ? <ErrorBanner message={errorMessage(error)} onRetry={() => void mutate()} /> : null}
      {isLoading ? (
        <div className="approval-skeletons">
          {[0, 1].map((item) => (
            <div key={item}>
              <Skeleton className="sk-circle" />
              <span>
                <Skeleton className="sk-wide" />
                <Skeleton className="sk-text" />
              </span>
            </div>
          ))}
        </div>
      ) : decisions.length === 0 ? (
        <div className="empty-state">
          <span>
            <Icon name="check" />
          </span>
          <div>
            <b>You&apos;re all caught up.</b>
            <p>New suggestions appear here automatically.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="approval-list">
            {visible.map((decision) => (
              <ApprovalRow key={decision.id} decision={decision} busy={busyId === decision.id} onDecide={(approve) => void decide(decision, approve)} />
            ))}
          </div>
          {decisions.length > COLLAPSED_COUNT && (
            <button type="button" className="show-more" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
              {expanded ? 'Show fewer' : `Show ${decisions.length - COLLAPSED_COUNT} more`}
              <Icon name="chevron" size={16} />
            </button>
          )}
        </>
      )}
    </section>
  )
}
