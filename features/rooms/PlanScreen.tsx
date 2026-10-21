'use client'
// Allocation plan review (FR-RA-04, Figma "Allocation plan"): overall satisfaction, every line with
// its room, why, preference match and rules, the reasons behind each warning, guests no room could
// be found for, and Approve selected / Approve all / Reject. Nothing changes until approved.
import Link from 'next/link'
import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { ErrorBanner } from '@/components/ui/Feedback'
import { Skeleton } from '@/components/ui/Status'
import { useToast } from '@/components/ui/Toast'
import { useTimeZone } from '@/components/shell/SessionContext'
import { apiSend, errorMessage } from '@/lib/client/api'
import { formatTime, plural } from '@/lib/client/format'
import { failureMessage } from '@/lib/client/proposals'
import { refreshApi, useApi } from '@/lib/client/use-api'
import type { PlanLineView, PlanView } from '@/lib/repositories/room-plan'

const COLLAPSED = 8
const PREFERENCE_ICONS = { met: 'check', partly: 'alert', missed: 'x' } as const
const LINE_RESULT: Readonly<Record<string, { label: string; tone: string }>> = {
  approved: { label: 'Assigned', tone: 'success' },
  rejected: { label: 'Not chosen', tone: 'neutral' },
  failed: { label: 'Not applied', tone: 'error' },
  superseded: { label: 'Replaced', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'neutral' },
}

interface ApproveResult {
  readonly status: string
  readonly applied?: number
  readonly failed?: number
}

function Summary({ plan }: { readonly plan: PlanView }) {
  return (
    <section className="allocation-summary">
      <div className="satisfaction-hero">
        <span>
          <Icon name="sparkle" size={16} />
          Overall satisfaction
        </span>
        <b>{Math.round(plan.satisfaction * 100)}%</b>
        <small>How well the plan fits every guest</small>
      </div>
      <div className="allocation-stat allocation-stat--guests">
        <span>
          <Icon name="users" />
        </span>
        <div>
          <b>{plan.placed + plan.unplaced}</b>
          <small>guests</small>
        </div>
      </div>
      <div className="allocation-stat allocation-stat--rules">
        <span>
          <Icon name="check" />
        </span>
        <div>
          <b>{plan.meets_all}</b>
          <small>lines meet every preference</small>
        </div>
      </div>
      <div className="allocation-stat allocation-stat--warnings">
        <span>
          <Icon name="alert" />
        </span>
        <div>
          <b>{plan.warnings + plan.unplaced}</b>
          <small>lines have warnings</small>
        </div>
      </div>
    </section>
  )
}

function Reasons({ line }: { readonly line: PlanLineView }) {
  return (
    <div className="allocation-reasons">
      <div>
        <p>
          <Icon name="check" />
          <span>
            <b>Hard rules:</b> met
          </span>
        </p>
        {line.preferences.map((preference) => (
          <p key={preference.code} className={preference.status === 'met' ? '' : 'is-warning'}>
            <Icon name={PREFERENCE_ICONS[preference.status]} />
            <span>{preference.text}</span>
          </p>
        ))}
        {line.error ? (
          <p className="is-warning">
            <Icon name="alert" />
            <span>{failureMessage(line.error)}</span>
          </p>
        ) : null}
      </div>
      <span>
        <Link className="hm-button hm-button--ghost" href={`/guests/${line.guest.id}`}>
          <span>View guest</span>
        </Link>
      </span>
    </div>
  )
}

function LineRow({ line, pending, checked, expanded, onToggle, onExpand }: { readonly line: PlanLineView; readonly pending: boolean; readonly checked: boolean; readonly expanded: boolean; readonly onToggle: () => void; readonly onExpand: () => void }) {
  const result = LINE_RESULT[line.status]
  const warning = !line.meets_all || line.status === 'failed'
  return (
    <>
      <div className={`allocation-row ${warning ? 'is-warning' : ''}`}>
        {pending ? (
          <button type="button" className={`plan-checkbox ${checked ? 'is-checked' : ''}`} onClick={onToggle} aria-label={`Select ${line.guest.name}`} aria-pressed={checked}>
            {checked ? <Icon name="check" size={14} /> : null}
          </button>
        ) : (
          <span className={`arrival-badge arrival-badge--${result?.tone ?? 'neutral'}`}>{result?.label ?? line.status}</span>
        )}
        <div className="allocation-guest">
          <span>
            <b>{line.guest.name}</b>
          </span>
          <small>
            {line.guest.role} · {line.guest.delegation}
          </small>
        </div>
        <div className="allocation-room">
          <b>{line.room.number}</b>
          <span>
            <strong>{line.room.type}</strong>
            <small>
              {line.room.wing} wing · F{line.room.floor}
            </small>
          </span>
        </div>
        <div className="allocation-why">
          <span>{line.why}</span>
        </div>
        <div className="allocation-match">
          <span className={`arrival-badge arrival-badge--${line.match === 'High' ? 'success' : line.match === 'Partial' ? 'warning' : 'error'}`}>{line.match}</span>
        </div>
        <div className="allocation-rules">
          <span className={`arrival-badge arrival-badge--${warning ? 'warning' : 'success'}`}>
            <Icon name={warning ? 'alert' : 'check'} size={13} />
            {warning ? 'Warning' : 'Meets all'}
          </span>
        </div>
        <button type="button" className={`allocation-chevron ${expanded ? 'is-open' : ''}`} onClick={onExpand} aria-expanded={expanded} aria-label={`Why room ${line.room.number} for ${line.guest.name}`}>
          <Icon name="chevron" size={17} />
        </button>
      </div>
      {expanded ? <Reasons line={line} /> : null}
    </>
  )
}

function usePlanDecision(plan: PlanView | undefined) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const decide = async (body: { line_ids?: string[] } | null) => {
    if (!plan) return
    setBusy(true)
    try {
      if (body === null) {
        await apiSend(`/api/proposals/${plan.id}/reject`, 'POST', {})
        toast.show({ message: 'Plan rejected. Nothing was changed.' })
      } else {
        const result = await apiSend<ApproveResult>(`/api/proposals/${plan.id}/approve`, 'POST', body)
        const failed = result.failed ? ` ${plural(result.failed, 'line')} could not be applied.` : ''
        toast.show({ message: `Plan approved. ${plural(result.applied ?? 0, 'room')} assigned.${failed}`, tone: result.failed ? 'info' : undefined })
      }
    } catch (caught: unknown) {
      toast.show({ message: errorMessage(caught), tone: 'error' })
    } finally {
      setBusy(false)
      await refreshApi('/api/allocation', '/api/rooms', '/api/decisions', '/api/dashboard', '/api/guests')
    }
  }
  return { busy, decide }
}

function Banner({ plan, timeZone }: { readonly plan: PlanView; readonly timeZone: string }) {
  if (plan.status === 'pending') return null
  const applied = plan.lines.filter((line) => line.status === 'approved').length
  if (plan.status === 'approved') {
    return (
      <div className="allocation-result is-approved">
        <Icon name="check" />
        <span>
          Plan approved{plan.decided_by ? ` by ${plan.decided_by}` : ''}
          {plan.decided_at ? ` · ${formatTime(plan.decided_at, timeZone)}` : ''}. {plural(applied, 'room')} assigned.
        </span>
        <Link href="/rooms">Open Rooms</Link>
      </div>
    )
  }
  return (
    <div className={plan.status === 'rejected' ? 'allocation-result is-rejected' : 'allocation-expired'}>
      <Icon name={plan.status === 'rejected' ? 'minus' : 'alert'} />
      <span>{plan.status === 'rejected' ? 'Plan rejected. Nothing was changed.' : 'This plan was replaced by a newer one. Run the allocator again from Rooms.'}</span>
    </div>
  )
}

export function PlanScreen({ planId }: { readonly planId: string }) {
  const timeZone = useTimeZone()
  const { data: plan, error, mutate } = useApi<PlanView>(`/api/allocation/plans/${planId}`)
  const [unchecked, setUnchecked] = useState<Set<string> | null>(null)
  const [expanded, setExpanded] = useState<string[]>([])
  const [showAll, setShowAll] = useState(false)
  const decision = usePlanDecision(plan)
  const pending = plan?.status === 'pending'
  // Lines with a warning start unticked, as in the design; the rest are ticked.
  const off = unchecked ?? new Set(plan?.lines.filter((line) => !line.meets_all).map((line) => line.id) ?? [])
  const chosen = plan?.lines.filter((line) => !off.has(line.id)).map((line) => line.id) ?? []
  const toggle = (id: string) => setUnchecked(new Set(off.has(id) ? [...off].filter((item) => item !== id) : [...off, id]))
  const visible = showAll ? (plan?.lines ?? []) : (plan?.lines ?? []).slice(0, COLLAPSED)

  return (
    <main className="allocation-page">
      <header className="allocation-header">
        <div>
          <span>
            <h1>Allocation plan</h1>
            {pending ? (
              <i>
                <Icon name="sparkle" size={14} />
                Suggested
              </i>
            ) : null}
          </span>
          <p>{plan ? `Suggested at ${formatTime(plan.created_at, timeZone)} for ${plural(plan.placed + plan.unplaced, 'guest')}.` : 'Loading…'}</p>
        </div>
      </header>
      <nav className="allocation-tabs" aria-label="Rooms">
        <Link href="/rooms">Overview</Link>
        <button type="button" className="is-active" aria-current="page">
          Allocation plan
        </button>
      </nav>
      {error ? <ErrorBanner message={errorMessage(error)} onRetry={() => void mutate()} /> : null}
      {!plan && !error ? (
        <div className="allocation-loading">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} />
          ))}
        </div>
      ) : null}
      {plan ? (
        <>
          <Banner plan={plan} timeZone={timeZone} />
          <Summary plan={plan} />
          {plan.unplaced_guests.length > 0 ? (
            <div className="allocation-expired" role="note">
              <Icon name="alert" />
              <span>
                No room found for {plan.unplaced_guests.map((guest) => guest.name).join(', ')}. {plan.unplaced_guests[0]?.reason ?? ''} Free a room or assign by hand from the guest profile.
              </span>
            </div>
          ) : null}
          <section className="allocation-table">
            <div className="allocation-table-head">
              {pending ? (
                <button type="button" className={`plan-checkbox ${chosen.length === plan.lines.length ? 'is-checked' : chosen.length > 0 ? 'is-mixed' : ''}`} aria-label="Select all lines" onClick={() => setUnchecked(chosen.length === plan.lines.length ? new Set(plan.lines.map((line) => line.id)) : new Set())}>
                  {chosen.length === plan.lines.length ? <Icon name="check" size={14} /> : chosen.length > 0 ? <i /> : null}
                </button>
              ) : (
                <span>Result</span>
              )}
              <span>Guest</span>
              <span>Suggested room</span>
              <span>Why</span>
              <span>Preference match</span>
              <span>Rules</span>
              <span />
            </div>
            {visible.map((line) => (
              <LineRow key={line.id} line={line} pending={pending} checked={!off.has(line.id)} expanded={expanded.includes(line.id)} onToggle={() => toggle(line.id)} onExpand={() => setExpanded((items) => (items.includes(line.id) ? items.filter((item) => item !== line.id) : [...items, line.id]))} />
            ))}
            {plan.lines.length > COLLAPSED ? (
              <button type="button" className={`allocation-more ${showAll ? 'is-open' : ''}`} onClick={() => setShowAll((value) => !value)}>
                {showAll ? 'Show fewer lines' : `Show ${plan.lines.length - COLLAPSED} more lines`}
                <Icon name="chevron" size={17} />
              </button>
            ) : null}
          </section>
          {pending ? (
            <div className="allocation-approval">
              <span>
                <Icon name="shield" />
                <b>Nothing changes until you approve.</b>
              </span>
              <div>
                <button type="button" className="reject-plan" disabled={decision.busy} onClick={() => void decision.decide(null)}>
                  Reject plan
                </button>
                <button type="button" className="approve-selected" disabled={decision.busy || chosen.length === 0} onClick={() => void decision.decide({ line_ids: chosen })}>
                  Approve selected ({chosen.length})
                </button>
                <button type="button" className="approve-all" disabled={decision.busy} onClick={() => void decision.decide({})}>
                  Approve all {plan.lines.length}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  )
}
