'use client'
// Event setup, the shared registration link (FR-IN-01), the flight data mode and event data export/purge (Super Admin).
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorBanner } from '@/components/ui/Feedback'
import { FormDialog } from '@/components/ui/FormDialog'
import { Pill, Skeleton } from '@/components/ui/Status'
import { useToast } from '@/components/ui/Toast'
import { useSession } from '@/components/shell/SessionContext'
import { EVENT_MANAGERS, hasAnyRole } from '@/lib/auth/roles'
import { ApiClientError, apiSend, errorMessage } from '@/lib/client/api'
import { useAction } from '@/lib/client/use-action'
import { refreshApi, useApi } from '@/lib/client/use-api'
import { EventDataCard } from './EventDataCard'
import { EventForm } from './EventForm'
import type { EventSettings } from './types'

function IntakeLinkCard({ event }: { readonly event: EventSettings }) {
  const toast = useToast()
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const action = useAction()
  const link = typeof window === 'undefined' ? `/register/${event.intake_token}` : `${window.location.origin}/register/${event.intake_token}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast.show({ message: 'Registration link copied.' })
    } catch {
      toast.show({ message: 'Copy failed. Select the link and copy it by hand.', tone: 'error' })
    }
  }
  const setOpen = (open: boolean) =>
    void action.run(async () => {
      await apiSend('/api/admin/event', 'PATCH', { intake_open: open })
      toast.show({ message: open ? 'Registration link is open.' : 'Registration link is closed.' })
      await refreshApi('/api/admin/event')
    })
  const regenerate = () =>
    void action.run(async () => {
      await apiSend('/api/admin/event/intake-token', 'POST', {})
      setConfirmRegenerate(false)
      toast.show({ message: 'New link created. The old link no longer works.' })
      await refreshApi('/api/admin/event')
    })

  return (
    <section className="data-card" aria-labelledby="intake-link-title">
      <header>
        <div>
          <h2 id="intake-link-title">Registration link</h2>
          <p>Share one link with every secretariat. Guests never sign in.</p>
        </div>
        <div>
          <Pill tone={event.intake_open ? 'success' : 'neutral'}>{event.intake_open ? 'Open' : 'Closed'}</Pill>
        </div>
      </header>
      <div className="link-card-body">
        <code className="link-box">{link}</code>
        <div className="inline-list">
          <Button icon="copy" onClick={() => void copy()}>
            Copy link
          </Button>
          <Button busy={action.busy} onClick={() => setOpen(!event.intake_open)}>
            {event.intake_open ? 'Close link' : 'Open link'}
          </Button>
          <Button kind="ghost" icon="repeat" onClick={() => setConfirmRegenerate(true)}>
            New link
          </Button>
        </div>
        {action.error && !confirmRegenerate && <p className="form-error">{action.error}</p>}
      </div>
      {confirmRegenerate && (
        <FormDialog
          title="Create a new registration link?"
          description="The current link stops working immediately. Send the new one to everyone who still needs to register."
          submitLabel="Create new link"
          width="compact"
          danger
          onSubmit={regenerate}
          onClose={() => setConfirmRegenerate(false)}
          busy={action.busy}
          error={action.error}
        />
      )}
    </section>
  )
}

function FlightModeCard({ event }: { readonly event: EventSettings }) {
  const router = useRouter()
  const toast = useToast()
  const { user } = useSession()
  const action = useAction()
  const canChange = user.role === 'super_admin'
  const next = event.flight_mode === 'live' ? 'simulated' : 'live'

  const change = () =>
    void action.run(async () => {
      await apiSend('/api/admin/event', 'PATCH', { flight_mode: next })
      toast.show({ message: next === 'live' ? 'Now using live flight data.' : 'Now using simulated flight data.' })
      await refreshApi('/api/admin/event')
      router.refresh()
    })

  return (
    <section className="data-card" aria-labelledby="flight-mode-title">
      <header>
        <div>
          <h2 id="flight-mode-title">Flight data</h2>
          <p>
            {event.flight_mode === 'live'
              ? 'Live: flights are tracked through the flight data provider.'
              : 'Simulated: flights follow scripted scenarios, for testing and demos. A banner shows on every screen.'}
          </p>
        </div>
        <div>
          <Pill tone={event.flight_mode === 'live' ? 'success' : 'warning'}>{event.flight_mode === 'live' ? 'Live' : 'Simulated'}</Pill>
          {canChange ? (
            <Button busy={action.busy} onClick={change}>
              Switch to {next}
            </Button>
          ) : (
            <span className="field-note">Only a Super Admin can switch this.</span>
          )}
        </div>
      </header>
      {action.error && <ErrorBanner className="settings-error" message={action.error} />}
    </section>
  )
}

export function SystemTab() {
  const router = useRouter()
  const toast = useToast()
  const { data, error, isLoading, mutate } = useApi<EventSettings>('/api/admin/event')
  const missing = error instanceof ApiClientError && error.code === 'not_found'

  if (isLoading) return <Skeleton className="sk-wide" />
  if (error && !missing) return <ErrorBanner className="settings-error" message={errorMessage(error)} onRetry={() => void mutate()} />
  if (!data) return <NoEventYet />

  return (
    <div className="settings-section">
      <EventForm
        key={data.id}
        event={data}
        onSaved={() => {
          toast.show({ message: 'Event saved.' })
          void mutate()
          router.refresh()
        }}
      />
      <IntakeLinkCard event={data} />
      <FlightModeCard event={data} />
      <EventDataCard event={data} />
    </div>
  )
}

/** No event to work in yet (P9): managers create one on the Events page; others wait to be added. */
function NoEventYet() {
  const { user } = useSession()
  const canCreate = hasAnyRole(user.role, EVENT_MANAGERS)
  return (
    <EmptyState
      icon="calendar"
      title="No event yet"
      action={
        canCreate ? (
          <Link className="hm-button hm-button--primary" href="/events">
            Go to Events
          </Link>
        ) : undefined
      }
    >
      {canCreate
        ? 'Create an event on the Events page. Its settings appear here once you work in it.'
        : 'A Programme Manager creates events and adds you to the team. Its settings appear here then.'}
    </EmptyState>
  )
}
