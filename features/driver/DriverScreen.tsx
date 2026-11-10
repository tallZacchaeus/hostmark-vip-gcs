'use client'
// The driver app (03-App-Flow.md /driver, Figma "Driver pickups", FR-FT-09): today's or tomorrow's
// trips, the current one big with one button (start → picked up → dropped off), changed trips to
// confirm, and trips moved to someone else. Updates arrive live through the notification stream.
import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useToast } from '@/components/ui/Toast'
import { NotificationsDrawer } from '@/components/shell/NotificationsDrawer'
import { useSession, useTimeZone } from '@/components/shell/SessionContext'
import { useNow } from '@/components/shell/useNow'
import { apiSend, errorMessage } from '@/lib/client/api'
import { addDays, dateKey, firstName, formatLongDay, formatTime } from '@/lib/client/format'
import { signOut } from '@/lib/client/session-actions'
import { refreshApi, useApi } from '@/lib/client/use-api'
import { type DriverTrip, changeNotice, flightStatus, nextStep, partyLabel, personName, progressLabel, splitDay } from './model'
import { CallCoordinator } from './CallCoordinator'
import { PickupSheet } from './PickupSheet'

interface DriverDayResponse {
  readonly day: string
  /** The coordination desk's phone (E.164), null when the event has none. */
  readonly coordinator_phone: string | null
  readonly trips: DriverTrip[]
}

const STEP_MESSAGES = { en_route: 'On your way. Drive safely.', picked_up: 'Marked as picked up.', completed: 'Trip complete. Thank you!' } as const

function useTripActions() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const act = async (path: string, body: unknown, message: string) => {
    setBusy(true)
    try {
      await apiSend(path, 'POST', body)
      toast.show({ message })
    } catch (caught: unknown) {
      toast.show({ message: errorMessage(caught), tone: 'error' })
    } finally {
      setBusy(false)
      await refreshApi('/api/driver/')
    }
  }
  return {
    busy,
    advance: (trip: DriverTrip) => {
      const step = nextStep(trip)
      return act(`/api/driver/assignments/${trip.assignment_id}/status`, { status: step.status }, STEP_MESSAGES[step.status])
    },
    acknowledge: (trip: DriverTrip) => act(`/api/driver/assignments/${trip.assignment_id}/acknowledge`, {}, 'Got it.'),
  }
}

interface HeroProps {
  readonly trip: DriverTrip
  readonly timeZone: string
  readonly coordinatorPhone: string | null
  readonly busy: boolean
  readonly onAdvance: () => void
  readonly onAcknowledge: () => void
  readonly onOpen: () => void
}

function Hero({ trip, timeZone, coordinatorPhone, busy, onAdvance, onAcknowledge, onOpen }: HeroProps) {
  const flight = flightStatus(trip)
  const change = changeNotice(trip, timeZone)
  const progress = progressLabel(trip)
  const step = nextStep(trip)
  return (
    <article className="driver-hero">
      <button type="button" className="driver-hero-open" onClick={onOpen} aria-label={`Details for the ${formatTime(trip.pickup_at, timeZone)} pickup`}>
        <span className="driver-card-label">{trip.en_route_at ? 'CURRENT PICKUP' : 'NEXT PICKUP'}</span>
        <strong>{formatTime(trip.pickup_at, timeZone)}</strong>
      </button>
      {flight && trip.flight_number ? (
        <div className={`driver-flight ${flight.landed ? 'is-landed' : ''}`}>
          <code>{trip.flight_number}</code>
          <span>{flight.label}</span>
        </div>
      ) : null}
      <p>
        <Icon name="pin" />
        {trip.pickup_location}
      </p>
      <p>
        <Icon name="users" />
        {trip.passenger_count} {trip.passenger_count === 1 ? 'passenger' : 'passengers'}
      </p>
      <div className="driver-guest">
        <b>{personName(trip.principal)}</b>
        {trip.principal.category ? <i>{trip.principal.category}</i> : null}
        {trip.passenger_count > 1 ? <span>+{trip.passenger_count - 1}</span> : null}
      </div>
      {change ? (
        <div className="driver-change">
          <Icon name="alert" size={16} />
          <span>{change}</span>
          <button type="button" className="driver-ack" disabled={busy} onClick={onAcknowledge}>
            Got it
          </button>
        </div>
      ) : null}
      {progress ? (
        <div className={`driver-active-status ${trip.picked_up_at ? 'is-picked' : ''}`}>
          <i />
          {progress}
        </div>
      ) : null}
      <div className="driver-hero-actions">
        <button type="button" className={step.status === 'en_route' ? 'driver-start' : 'driver-picked'} disabled={busy} onClick={onAdvance}>
          {step.status !== 'en_route' && <Icon name="check" />}
          {busy ? 'Saving…' : step.label}
        </button>
        <CallCoordinator phone={coordinatorPhone} />
      </div>
    </article>
  )
}

function SmallCard({ trip, timeZone, done, onOpen }: { readonly trip: DriverTrip; readonly timeZone: string; readonly done?: boolean; readonly onOpen: () => void }) {
  return (
    <button type="button" className={`driver-small-card ${done ? 'is-done' : ''}`} onClick={onOpen}>
      <time>{formatTime(trip.pickup_at, timeZone)}</time>
      <span>
        <b>{partyLabel(trip)}</b>
        <small>{trip.pickup_location}</small>
      </span>
      <i>{done ? 'Done' : trip.acknowledged_at ? 'Not started' : 'New'}</i>
    </button>
  )
}

interface DayViewProps {
  readonly trips: DriverTrip[]
  readonly timeZone: string
  readonly coordinatorPhone: string | null
  readonly onOpen: (trip: DriverTrip) => void
}

function DayView({ trips, timeZone, coordinatorPhone, onOpen }: DayViewProps) {
  const actions = useTripActions()
  const day = splitDay(trips)
  return (
    <>
      {day.hero ? (
        <Hero trip={day.hero} timeZone={timeZone} coordinatorPhone={coordinatorPhone} busy={actions.busy} onAdvance={() => void actions.advance(day.hero as DriverTrip)} onAcknowledge={() => void actions.acknowledge(day.hero as DriverTrip)} onOpen={() => onOpen(day.hero as DriverTrip)} />
      ) : null}
      {day.later.length > 0 ? <h2 className="driver-section-label">LATER</h2> : null}
      {day.later.map((trip) => (
        <SmallCard key={trip.assignment_id} trip={trip} timeZone={timeZone} onOpen={() => onOpen(trip)} />
      ))}
      {day.moved.length > 0 ? <h2 className="driver-section-label">MOVED</h2> : null}
      {day.moved.map((trip) => (
        <div className="driver-moved-card" key={trip.assignment_id}>
          <time>{formatTime(trip.pickup_at, timeZone)}</time>
          <div>
            <b>{partyLabel(trip)}</b>
            <span>
              <Icon name="swap" size={15} />
              This pickup was moved to another driver.
            </span>
          </div>
        </div>
      ))}
      {day.done.length > 0 ? <h2 className="driver-section-label">DONE</h2> : null}
      {day.done.map((trip) => (
        <SmallCard key={trip.assignment_id} trip={trip} timeZone={timeZone} done onOpen={() => onOpen(trip)} />
      ))}
    </>
  )
}

export function DriverScreen() {
  const { user } = useSession()
  const timeZone = useTimeZone()
  const now = useNow()
  const [tomorrow, setTomorrow] = useState(false)
  const [sheet, setSheet] = useState<DriverTrip | null>(null)
  const [notifications, setNotifications] = useState(false)
  const today = now ? dateKey(now, timeZone) : null
  const day = today ? (tomorrow ? addDays(today, 1) : today) : null
  const { data, error } = useApi<DriverDayResponse>(day ? `/api/driver/pickups?day=${day}` : null)
  const trips = data?.trips ?? []
  const empty = data && trips.length === 0
  const coordinatorPhone = data?.coordinator_phone ?? null

  return (
    <main className="driver-page">
      <div className="driver-phone-frame">
        <div className="driver-phone-content">
          <header className="driver-header">
            <div>
              <h1>Hello, {firstName(user.fullName)}</h1>
              <p>{day ? formatLongDay(`${day}T12:00:00Z`, 'UTC') : ' '}</p>
            </div>
            <button type="button" aria-label="Notifications" onClick={() => setNotifications(true)}>
              <Icon name="bell" />
            </button>
          </header>
          <div className="driver-segments" role="group" aria-label="Day">
            <button type="button" className={!tomorrow ? 'is-active' : ''} aria-pressed={!tomorrow} onClick={() => setTomorrow(false)}>
              Today
            </button>
            <button type="button" className={tomorrow ? 'is-active' : ''} aria-pressed={tomorrow} onClick={() => setTomorrow(true)}>
              Tomorrow
            </button>
          </div>
          {error ? (
            <div className="driver-offline" role="alert">
              <Icon name="wifiOff" />
              <span>{data ? "You're offline. Showing your last update." : errorMessage(error)}</span>
            </div>
          ) : null}
          {empty ? (
            <div className="driver-empty">
              <span>
                <Icon name="coffee" size={38} />
              </span>
              <h2>{tomorrow ? 'No pickups tomorrow yet.' : 'No pickups today.'}</h2>
              <p>{tomorrow ? 'Check back later today.' : 'Enjoy the break.'}</p>
              <CallCoordinator phone={coordinatorPhone} light />
            </div>
          ) : (
            <DayView trips={trips} timeZone={timeZone} coordinatorPhone={coordinatorPhone} onOpen={setSheet} />
          )}
        </div>
        <nav className="driver-tabbar" aria-label="Driver app">
          <button type="button" className="is-active" aria-current="page">
            <Icon name="car" />
            <span>Pickups</span>
          </button>
          <button type="button" onClick={() => void signOut()}>
            <Icon name="logOut" />
            <span>Sign out</span>
          </button>
        </nav>
        {sheet ? <PickupSheet trip={sheet} timeZone={timeZone} coordinatorPhone={coordinatorPhone} onClose={() => setSheet(null)} /> : null}
      </div>
      {notifications ? <NotificationsDrawer onClose={() => setNotifications(false)} /> : null}
    </main>
  )
}
