'use client'
// The Events page (P9 step 9.4) for Programme Managers and Super Admins: their events (a Super
// Admin sees all), a new draft, going live and archiving, each event's team and copying setup.
// Everything else about an event is set in Settings while working in it.
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorBanner } from '@/components/ui/Feedback'
import { Skeleton } from '@/components/ui/Status'
import { useToast } from '@/components/ui/Toast'
import { useSession } from '@/components/shell/SessionContext'
import { apiSend, errorMessage } from '@/lib/client/api'
import { navigateTo } from '@/lib/client/navigate'
import { useAction } from '@/lib/client/use-action'
import { useApi } from '@/lib/client/use-api'
import { EventForm } from '@/features/settings/EventForm'
import { CopySetupDialog } from './CopySetupDialog'
import { EventCard } from './EventCard'
import { TeamDialog } from './TeamDialog'
import type { ManagedEvent } from './types'

const EVENTS_PATH = '/api/events'
/** After opening an event, its settings are the natural first stop. */
const OPEN_EVENT_LANDING = '/settings?tab=system'

type Panel = { kind: 'team' | 'copy'; event: ManagedEvent } | null

export function EventsScreen() {
  const { user } = useSession()
  const toast = useToast()
  const { data, error, isLoading, mutate } = useApi<ManagedEvent[]>(EVENTS_PATH)
  const [creating, setCreating] = useState(false)
  const [panel, setPanel] = useState<Panel>(null)
  const action = useAction()

  const open = (event: ManagedEvent) =>
    void action.run(async () => {
      await apiSend('/api/me/event', 'PUT', { event_id: event.id })
      navigateTo(OPEN_EVENT_LANDING)
    })

  const changeStatus = (event: ManagedEvent, status: 'live' | 'archived') =>
    action.run(async () => {
      await apiSend(`${EVENTS_PATH}/${event.id}`, 'PATCH', { status })
      toast.show({ message: status === 'live' ? `${event.name} is live.` : `${event.name} is archived.` })
      await mutate()
    })

  const events = data ?? []
  return (
    <main className="settings-page events-page">
      <header className="settings-header events-header">
        <div>
          <h1>Events</h1>
          <p>Prepare a draft while your live event runs, then take it live and archive the old one.</p>
        </div>
        {!creating && (
          <Button kind="primary" icon="plus" onClick={() => setCreating(true)}>
            New event
          </Button>
        )}
      </header>

      {creating && (
        <div className="settings-section">
          <EventForm
            event={null}
            onSaved={(saved) => {
              setCreating(false)
              toast.show({ message: `${saved.name} created as a draft. Copy setup or choose its team next.` })
              void mutate()
            }}
          />
          <Button kind="ghost" onClick={() => setCreating(false)}>
            Cancel
          </Button>
        </div>
      )}

      {isLoading && <Skeleton className="sk-wide" />}
      {error ? <ErrorBanner className="settings-error" message={errorMessage(error)} onRetry={() => void mutate()} /> : null}
      {data && events.length === 0 && !creating && (
        <EmptyState icon="calendar" title="No events yet" action={<Button kind="primary" icon="plus" onClick={() => setCreating(true)}>New event</Button>}>
          Create your first event. It starts as a draft, so you can set it up before taking it live.
        </EmptyState>
      )}

      <div className="events-list">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            showOwner={user.role === 'super_admin'}
            busy={action.busy}
            error={action.error}
            onStatus={(status) => changeStatus(event, status)}
            onOpen={() => open(event)}
            onTeam={() => setPanel({ kind: 'team', event })}
            onCopy={() => setPanel({ kind: 'copy', event })}
          />
        ))}
      </div>
      {action.error && !panel && <ErrorBanner className="settings-error" message={action.error} />}

      {panel?.kind === 'team' && <TeamDialog event={panel.event} onChanged={() => void mutate()} onClose={() => setPanel(null)} />}
      {panel?.kind === 'copy' && (
        <CopySetupDialog
          target={panel.event}
          sources={events.filter((event) => event.id !== panel.event.id)}
          onCopied={(message) => {
            setPanel(null)
            toast.show({ message })
            void mutate()
          }}
          onClose={() => setPanel(null)}
        />
      )}
    </main>
  )
}
