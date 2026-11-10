'use client'
// Programme (03-App-Flow.md /programme, Figma "Programme", FR-PG-01…04): the day's timeline with
// each item's state (on track, at risk, done), who is late and why, the venues in use and the
// at-risk count. Coordinators see the published programme and can alert the programs team; the
// programs team (and Admin) add, edit, publish and cancel items. Items left outside the event days
// (when the dates change) stay reachable under an "Outside the event days" note.
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Badge, Skeleton } from '@/components/ui/Status'
import { useToast } from '@/components/ui/Toast'
import { useSession, useTimeZone } from '@/components/shell/SessionContext'
import { COORDINATOR_PLUS, hasAnyRole } from '@/lib/auth/roles'
import { apiSend, errorMessage } from '@/lib/client/api'
import { formatLongDay, formatShortDay, formatTime } from '@/lib/client/format'
import { refreshApi, useApi } from '@/lib/client/use-api'
import type { ProgrammeView, ProgramItemView } from '@/lib/repositories/programme'
import { ItemDialog } from './ItemDialog'
import { KIND_LABELS, PROGRAMME_PATH, ROLE_LABELS, STATE_BADGES, riskSentence } from './model'

const REFRESH_MS = 60_000
const SKELETON_ROWS = 4

interface RowProps {
  readonly item: ProgramItemView
  readonly first: boolean
  readonly last: boolean
  readonly timeZone: string
  readonly expanded: boolean
  readonly canEdit: boolean
  /** Coordinators and above: open guest profiles and alert the programs team. */
  readonly canOpenGuests: boolean
  readonly onToggle: () => void
  readonly onEdit: () => void
  readonly onNotify: () => void
}

function RiskDetail({ item, timeZone, canOpenGuests, onNotify }: Pick<RowProps, 'item' | 'timeZone' | 'canOpenGuests' | 'onNotify'>) {
  const late = item.participants.find((participant) => participant.late)
  return (
    <div className="programme-risk-detail">
      <p>{riskSentence(item, timeZone)}</p>
      <div>
        {canOpenGuests && late ? (
          <Link className="hm-button hm-button--secondary" href={`/guests/${late.delegation_id}`}>
            Open guest
          </Link>
        ) : null}
        {item.risk_notified_at ? (
          <span>
            <Icon name="check" size={15} />
            Programme team notified · {formatTime(item.risk_notified_at, timeZone)}
          </span>
        ) : canOpenGuests ? (
          <Button onClick={onNotify}>Notify programme team</Button>
        ) : null}
      </div>
    </div>
  )
}

function ItemDetail({ item, timeZone, canEdit, onEdit }: Pick<RowProps, 'item' | 'timeZone' | 'canEdit' | 'onEdit'>) {
  return (
    <div className="programme-item-detail">
      <p>
        {KIND_LABELS[item.kind]} · {formatTime(item.starts_at, timeZone)}–{formatTime(item.ends_at, timeZone)}
        {item.description ? ` · ${item.description}` : ''}
      </p>
      {item.participants.length > 0 ? (
        <ul aria-label="Participants">
          {item.participants.map((participant) => (
            <li key={participant.guest_id} className={participant.late ? 'is-late' : ''}>
              <b>{participant.name}</b> {ROLE_LABELS[participant.role]}
              {participant.arrived ? ' · arrived' : participant.expected_at ? ` · expected ${formatTime(participant.expected_at, timeZone)}` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p>No VIP participants listed.</p>
      )}
      {canEdit ? (
        <Button icon="edit" onClick={onEdit}>
          Edit item
        </Button>
      ) : null}
    </div>
  )
}

function TimelineRow(props: RowProps) {
  const { item, first, last, timeZone, expanded, onToggle } = props
  const badge = STATE_BADGES[item.state]
  const risk = item.state === 'risk'
  return (
    <div className={`programme-item programme-item--${item.state === 'risk' ? 'risk' : item.state === 'done' ? 'done' : 'track'}`}>
      <button type="button" className="programme-row is-clickable" aria-expanded={expanded} onClick={onToggle}>
        <time>{formatTime(item.starts_at, timeZone)}</time>
        <span className={`programme-dot ${first ? 'is-first' : ''} ${last ? 'is-last' : ''}`}>
          {item.state === 'done' ? <Icon name="check" size={14} /> : null}
          {risk ? <Icon name="alert" size={13} /> : null}
        </span>
        <div className="programme-item-copy">
          <b>{item.title}</b>
          <span>
            <Icon name="pin" size={14} />
            {item.location}
          </span>
        </div>
        <span className="programme-badges">
          {item.status === 'draft' ? <Badge tone="neutral">Draft</Badge> : null}
          <Badge tone={badge.tone as 'success' | 'warning' | 'neutral'} icon={badge.icon}>
            {badge.label}
          </Badge>
        </span>
        <span className={`programme-chevron ${expanded ? 'is-open' : ''}`}>
          <Icon name="chevron" size={17} />
        </span>
      </button>
      {expanded && risk ? <RiskDetail {...props} /> : null}
      {expanded ? <ItemDetail {...props} /> : null}
    </div>
  )
}

function Side({ data }: { readonly data: ProgrammeView | undefined }) {
  const count = data?.at_risk_count ?? 0
  return (
    <aside className="programme-side">
      <section className="programme-risk-card">
        <h2>At risk</h2>
        <div className={count === 0 ? 'is-clear' : ''}>
          <span>{count === 0 ? <Icon name="check" size={24} /> : count}</span>
          <p>{count === 0 ? 'No items affected by arrivals on this day' : `${count === 1 ? 'Item' : 'Items'} affected by arrivals on this day`}</p>
        </div>
      </section>
      <section className="programme-venues">
        <h2>Venues</h2>
        {(data?.venues ?? []).length === 0 ? <small>No items yet.</small> : null}
        {(data?.venues ?? []).map((venue) => (
          <div key={venue.name}>
            <Icon name="door" size={18} />
            <b>{venue.name}</b>
            <span>
              {venue.count} {venue.count === 1 ? 'item' : 'items'}
            </span>
          </div>
        ))}
      </section>
    </aside>
  )
}

export function ProgrammeScreen() {
  const timeZone = useTimeZone()
  const { user } = useSession()
  const toast = useToast()
  const [day, setDay] = useState<string | undefined>(undefined)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [editing, setEditing] = useState<ProgramItemView | 'new' | null>(null)
  const path = day ? `${PROGRAMME_PATH}?day=${day}` : PROGRAMME_PATH
  const { data, error } = useApi<ProgrammeView>(path, { refreshInterval: REFRESH_MS })
  const canEdit = data?.can_edit ?? false
  const items = data?.items ?? []
  const outsideDays = data?.outside_days ?? []
  const isOutsideDay = data ? !data.days.includes(data.day) : false
  const isOpen = (item: ProgramItemView) => expanded.has(item.id) || (item.state === 'risk' && !expanded.has(`closed:${item.id}`))
  const toggle = (item: ProgramItemView) =>
    setExpanded((current) => {
      const next = new Set(current)
      const key = item.state === 'risk' ? `closed:${item.id}` : item.id
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const notify = (item: ProgramItemView) =>
    void apiSend(`/api/program-items/${item.id}/notify`, 'POST', {})
      .then(() => toast.show({ message: 'Programme team notified.' }))
      .catch((caught: unknown) => toast.show({ message: errorMessage(caught), tone: 'error' }))
      .finally(() => void refreshApi(PROGRAMME_PATH))

  return (
    <main className="programme-page">
      <header className="programme-header">
        <div>
          <h1>Programme</h1>
          <p>{data ? formatLongDay(`${data.day}T12:00:00Z`, 'UTC') : ' '}</p>
        </div>
        {canEdit ? (
          <Button kind="primary" icon="plus" onClick={() => setEditing('new')}>
            Add item
          </Button>
        ) : null}
      </header>
      <div className="programme-tabs" role="tablist" aria-label="Event days">
        {(data?.days ?? []).map((value) => (
          <button type="button" role="tab" key={value} aria-selected={data?.day === value} className={data?.day === value ? 'is-active' : ''} onClick={() => setDay(value)}>
            {formatShortDay(`${value}T12:00:00Z`, 'UTC')}
          </button>
        ))}
      </div>
      {outsideDays.length > 0 ? (
        <div className="programme-outside" role="note" aria-label="Outside the event days">
          <Icon name="alert" size={16} />
          <span>Outside the event days:</span>
          {outsideDays.map((value) => (
            <button type="button" key={value} aria-current={data?.day === value ? 'date' : undefined} className={data?.day === value ? 'is-active' : ''} onClick={() => setDay(value)}>
              {formatShortDay(`${value}T12:00:00Z`, 'UTC')}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <ErrorBanner className="programme-error" message={data ? "We couldn't refresh the programme. Showing the last update." : errorMessage(error)} onRetry={() => void refreshApi(PROGRAMME_PATH)} /> : null}
      <div className="programme-layout">
        <section className="programme-timeline" aria-label="Timeline">
          <header>
            <h2>Timeline</h2>
            <span>
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </span>
          </header>
          {isOutsideDay ? <p className="programme-outside-notice">This day is outside the event days. Move these items onto an event day, or cancel them.</p> : null}
          {!data ? (
            <div className="programme-loading">
              {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <Skeleton key={index} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="programme-empty">
              <span>
                <Icon name="calendar" size={25} />
              </span>
              <b>{canEdit ? 'No items on this day.' : 'Nothing published for this day yet.'}</b>
              {canEdit ? (
                <Button icon="plus" onClick={() => setEditing('new')}>
                  Add item
                </Button>
              ) : null}
            </div>
          ) : (
            <div>
              {items.map((item, index) => (
                <TimelineRow
                  key={item.id}
                  item={item}
                  first={index === 0}
                  last={index === items.length - 1}
                  timeZone={timeZone}
                  expanded={isOpen(item)}
                  canEdit={canEdit}
                  canOpenGuests={hasAnyRole(user.role, COORDINATOR_PLUS)}
                  onToggle={() => toggle(item)}
                  onEdit={() => setEditing(item)}
                  onNotify={() => notify(item)}
                />
              ))}
            </div>
          )}
        </section>
        <Side data={data} />
      </div>
      {editing && data ? (
        <ItemDialog
          item={editing === 'new' ? null : editing}
          day={isOutsideDay ? (data.days[0] ?? data.day) : data.day}
          days={data.days}
          venues={data.venues.map((venue) => venue.name)}
          timeZone={timeZone}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null)
            toast.show({ message })
          }}
        />
      ) : null}
    </main>
  )
}
