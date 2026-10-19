'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { AutoTag, Skeleton } from '@/components/ui/Status'
import { useToast } from '@/components/ui/Toast'
import { useTimeZone } from '@/components/shell/SessionContext'
import { type AuditEntry, DOMAIN_ICONS, actorLabel, domainOf, objectOf, verbOf } from '@/lib/client/activity-format'
import { apiSend, errorMessage } from '@/lib/client/api'
import { formatTime } from '@/lib/client/format'
import { refreshApi, useApi } from '@/lib/client/use-api'

const RECENT_COUNT = 4

export function RecentActivityCard() {
  const timeZone = useTimeZone()
  const toast = useToast()
  const { data, isLoading } = useApi<AuditEntry[]>(`/api/audit?limit=${RECENT_COUNT}`)
  const [busyId, setBusyId] = useState<string | null>(null)

  const undo = async (entry: AuditEntry) => {
    setBusyId(entry.id)
    try {
      await apiSend(`/api/audit/${entry.id}/undo`, 'POST', {})
      toast.show({ message: 'Automatic change undone.' })
      await refreshApi('/api/audit', '/api/dashboard')
    } catch (caught: unknown) {
      toast.show({ message: errorMessage(caught), tone: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="card-v4 recent-card" aria-labelledby="recent-title">
      <header>
        <h2 id="recent-title">Recent activity</h2>
        <Link href="/activity">View all</Link>
      </header>
      {isLoading ? (
        <div className="approval-skeletons">
          <Skeleton className="sk-wide" />
          <Skeleton className="sk-text" />
        </div>
      ) : (data ?? []).length === 0 ? (
        <p className="recent-empty">Nothing has changed yet.</p>
      ) : (
        (data ?? []).map((entry) => (
          <div className={`activity-row-v4 ${entry.undone ? 'is-undone' : ''}`} key={entry.id}>
            <span className="activity-icon-v4">
              <Icon name={DOMAIN_ICONS[domainOf(entry.entity_type)]} />
            </span>
            <div>
              <b>
                {actorLabel(entry)} {verbOf(entry.action)} {objectOf(entry).label}
              </b>
              {entry.is_automatic && (
                <small>
                  <AutoTag />
                  {entry.undone ? (
                    <span>Undone</span>
                  ) : entry.undoable ? (
                    <button type="button" disabled={busyId === entry.id} onClick={() => void undo(entry)}>
                      Undo
                    </button>
                  ) : null}
                </small>
              )}
            </div>
            <time dateTime={entry.occurred_at}>{formatTime(entry.occurred_at, timeZone)}</time>
          </div>
        ))
      )}
    </section>
  )
}
