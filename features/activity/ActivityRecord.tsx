'use client'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { type AuditEntry, DOMAIN_ICONS, actorLabel, changesOf, domainOf, objectOf, verbOf } from '@/lib/client/activity-format'
import { formatDayTime, formatTime } from '@/lib/client/format'

interface ActivityRecordProps {
  readonly entry: AuditEntry
  readonly timeZone: string
  readonly expanded: boolean
  readonly onToggle: () => void
  readonly onUndo: (entry: AuditEntry) => void
  readonly undoBusy: boolean
}

export function ActivityRecord({ entry, timeZone, expanded, onToggle, onUndo, undoBusy }: ActivityRecordProps) {
  const domain = domainOf(entry.entity_type)
  const object = objectOf(entry)
  const changes = changesOf(entry, (iso) => formatDayTime(iso, timeZone))
  const canUndo = entry.undoable && !entry.undone
  const detailsId = `activity-${entry.id}-details`

  return (
    <div className={`activity-record ${expanded ? 'is-expanded' : ''} ${entry.undone ? 'is-undone' : ''}`}>
      <span className={`activity-record-icon is-${domain.toLowerCase()}`}>
        <Icon name={DOMAIN_ICONS[domain]} />
      </span>
      <div className="activity-record-copy">
        <p>
          <b>{actorLabel(entry)}</b> {verbOf(entry.action)}{' '}
          {object.href ? (
            <Link className="activity-object-link" href={object.href}>
              {object.label}
            </Link>
          ) : (
            object.label
          )}
          .
        </p>
        {entry.reason && <small className="activity-reason">Reason: {entry.reason}</small>}
        {expanded && (
          <div className="activity-changes" id={detailsId}>
            {changes.length === 0 ? (
              <div>
                <b>No field changes recorded</b>
              </div>
            ) : (
              changes.map((change) => (
                <div key={change.label}>
                  <b>{change.label}</b>
                  <s>{change.oldValue}</s>
                  <Icon name="arrow" size={16} />
                  <strong>{change.newValue}</strong>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <div className="activity-record-meta">
        {entry.is_automatic && <span>AUTO</span>}
        {entry.undone ? (
          <i>Undone</i>
        ) : canUndo ? (
          <button type="button" disabled={undoBusy} onClick={() => onUndo(entry)}>
            Undo
          </button>
        ) : null}
      </div>
      <time dateTime={entry.occurred_at}>{formatTime(entry.occurred_at, timeZone)}</time>
      <button
        type="button"
        className="activity-record-chevron"
        aria-expanded={expanded}
        aria-controls={detailsId}
        aria-label={expanded ? 'Hide changes' : 'Show changes'}
        onClick={onToggle}
      >
        <Icon name="chevron" size={18} />
      </button>
    </div>
  )
}
