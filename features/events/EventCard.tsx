'use client'
// One event on the Events page: its dates, status and team, and what its manager can do next.
// Going live and archiving are confirmed first; archiving cannot be undone.
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FormDialog } from '@/components/ui/FormDialog'
import { Pill } from '@/components/ui/Status'
import { formatIsoDate } from '@/lib/client/format'
import type { EventStatus, ManagedEvent } from './types'

const STATUS: Readonly<Record<EventStatus, { label: string; tone: 'success' | 'warning' | 'neutral' }>> = {
  live: { label: 'Live', tone: 'success' },
  draft: { label: 'Draft', tone: 'warning' },
  archived: { label: 'Archived', tone: 'neutral' },
}

type Confirming = 'live' | 'archived' | null

interface EventCardProps {
  readonly event: ManagedEvent
  readonly showOwner: boolean
  readonly busy: boolean
  readonly error: string | null
  readonly onStatus: (status: 'live' | 'archived') => Promise<boolean>
  readonly onOpen: () => void
  readonly onTeam: () => void
  readonly onCopy: () => void
}

export function EventCard({ event, showOwner, busy, error, onStatus, onOpen, onTeam, onCopy }: EventCardProps) {
  const [confirming, setConfirming] = useState<Confirming>(null)
  const status = STATUS[event.status]
  const confirm = async () => {
    if (confirming && (await onStatus(confirming))) setConfirming(null)
  }

  return (
    <article className={`data-card event-card is-${event.status}`} aria-labelledby={`event-${event.id}`}>
      <header>
        <div>
          <h2 id={`event-${event.id}`}>{event.name}</h2>
          <p>
            {event.venue_name} · {formatIsoDate(event.starts_on)} – {formatIsoDate(event.ends_on)}
          </p>
        </div>
        <div>
          {event.is_current && <span className="event-card-current">You are working in this event</span>}
          <Pill tone={status.tone}>{status.label}</Pill>
        </div>
      </header>
      <dl className="event-card-facts">
        <div>
          <dt>Team</dt>
          <dd>{event.member_count} staff</dd>
        </div>
        {showOwner && (
          <div>
            <dt>Programme Manager</dt>
            <dd>{event.owner_name ?? 'None'}</dd>
          </div>
        )}
      </dl>
      <footer className="event-card-actions">
        {!event.is_current && (
          <Button kind="primary" icon="arrow" onClick={onOpen} busy={busy}>
            Work in this event
          </Button>
        )}
        {event.status !== 'archived' && (
          <Button icon="users" onClick={onTeam}>
            Team
          </Button>
        )}
        {event.status === 'draft' && (
          <Button icon="copy" onClick={onCopy}>
            Copy setup
          </Button>
        )}
        {event.status === 'draft' && (
          <Button icon="play" onClick={() => setConfirming('live')}>
            Go live
          </Button>
        )}
        {event.status !== 'archived' && (
          <Button kind="ghost" icon="packageX" onClick={() => setConfirming('archived')}>
            Archive
          </Button>
        )}
      </footer>
      {confirming === 'live' && (
        <FormDialog
          title={`Take ${event.name} live?`}
          description="The registration link and the background work start serving it. You can run one live event at a time; archive the other first."
          submitLabel="Go live"
          width="compact"
          onSubmit={() => void confirm()}
          onClose={() => setConfirming(null)}
          busy={busy}
          error={error}
        />
      )}
      {confirming === 'archived' && (
        <FormDialog
          title={`Archive ${event.name}?`}
          description="It becomes read-only for everyone: its records stay viewable, but nothing can be changed and its registration link closes. This cannot be undone."
          submitLabel="Archive event"
          width="compact"
          danger
          onSubmit={() => void confirm()}
          onClose={() => setConfirming(null)}
          busy={busy}
          error={error}
        />
      )}
    </article>
  )
}
