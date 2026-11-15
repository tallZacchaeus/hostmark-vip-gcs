'use client'
// Coordinator home (03-App-Flow.md /dashboard): decisions first, then context. Tiles and cards
// appear as their phases provide data; nothing here is sample data.
import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Skeleton } from '@/components/ui/Status'
import { useSession } from '@/components/shell/SessionContext'
import { useNow } from '@/components/shell/useNow'
import { firstName, greeting, plural } from '@/lib/client/format'
import { EVENT_MANAGERS, hasAnyRole } from '@/lib/auth/roles'
import { useApi } from '@/lib/client/use-api'
import { ApprovalsCard } from './ApprovalsCard'
import { ProgrammeRiskCard } from './ProgrammeRiskCard'
import { RecentActivityCard } from './RecentActivityCard'

export interface DashboardSummary {
  readonly rooms: { total: number; ready: number; needs_cleaning: number; cleaning: number; out_of_service: number }
  readonly decisions_pending: number
  readonly guests: { guests: number; delegations: number }
  readonly arrivals_today: { total: number; flying: number; by_road: number }
  readonly pickups_today: { total: number; needs_driver: number }
  readonly intake_to_review: number
  /** Today's published programme items at risk, with who is late (FR-PG-03). */
  readonly programme_at_risk: ReadonlyArray<{
    readonly id: string
    readonly title: string
    readonly starts_at: string
    readonly location: string
    readonly late: ReadonlyArray<{ readonly guest_id: string; readonly name: string; readonly expected_at: string | null }>
  }>
}

interface TileProps {
  readonly tone: string
  readonly icon: IconName
  readonly value: number
  readonly label: string
  readonly helper: string
  readonly href: string
}

function StatTile({ tone, icon, value, label, helper, href }: TileProps) {
  return (
    <Link className={`stat-tile stat-tile--${tone}`} href={href}>
      <span className="stat-icon">
        <Icon name={icon} />
      </span>
      <span className="stat-copy">
        <b>{value}</b>
        <strong>{label}</strong>
      </span>
      <span className="stat-arrow">
        <Icon name="arrow" size={16} />
      </span>
      <small>{helper}</small>
    </Link>
  )
}

const QUICK_ACTIONS: ReadonlyArray<{ icon: IconName; tone: string; title: string; helper: string; href: string }> = [
  { icon: 'message', tone: 'blue', title: 'Paste a message', helper: 'Send to Intake', href: '/intake?paste=1' },
  { icon: 'plane', tone: 'green', title: 'Check arrivals', helper: 'Flight status', href: '/arrivals' },
  { icon: 'bed', tone: 'orange', title: 'Manage rooms', helper: 'Plan & status', href: '/rooms' },
  { icon: 'car', tone: 'teal', title: 'Assign transport', helper: 'Drivers & vehicles', href: '/transport' },
  { icon: 'calendar', tone: 'purple', title: 'View programme', helper: 'Schedule & venues', href: '/programme' },
]

function Hero() {
  const { user, event } = useSession()
  const now = useNow()
  const timeZone = event?.timezone ?? 'UTC'
  const simulated = event?.flight_mode === 'simulated'
  return (
    <section className="hero-v4">
      <div className="hero-copy">
        <h1>
          {now ? greeting(now, timeZone) : 'Welcome'}, {firstName(user.fullName)}
        </h1>
        <p>Here&apos;s what&apos;s happening with your VIP guests today.</p>
        {event && (
          <span className="live-pill">
            <i />
            {simulated ? 'Simulated flight data' : 'Live flight data'}
          </span>
        )}
      </div>
      <div className="hero-photo" role="img" aria-label="Lagos skyline at golden hour">
        {event && (
          <span>
            <Icon name="pin" size={15} />
            {event.venue_name}
          </span>
        )}
      </div>
    </section>
  )
}

function StatsRow() {
  const { data } = useApi<DashboardSummary>('/api/dashboard/summary')
  if (!data) {
    return (
      <section className="stats-row" aria-busy="true">
        {[0, 1, 2, 3, 4].map((item) => (
          <div className="stat-tile stat-tile--loading" key={item}>
            <Skeleton className="sk-circle" />
            <Skeleton className="sk-number" />
            <Skeleton className="sk-label" />
          </div>
        ))}
      </section>
    )
  }
  const waiting = data.rooms.needs_cleaning + data.rooms.cleaning
  const arrivals = data.arrivals_today
  return (
    <section className="stats-row" aria-label="Today at a glance">
      <StatTile
        tone="guests"
        icon="users"
        value={data.guests.guests}
        label="VIP guests"
        helper={`${plural(data.guests.delegations, 'delegation')}${data.intake_to_review ? ` · ${data.intake_to_review} to review` : ''}`}
        href={data.intake_to_review ? '/intake' : '/guests'}
      />
      <StatTile
        tone="arrivals"
        icon="plane"
        value={arrivals.total}
        label="Arrivals today"
        helper={arrivals.total ? `${arrivals.flying} by air · ${arrivals.by_road} by road` : 'Nobody due today'}
        href="/arrivals"
      />
      <StatTile
        tone="pickups"
        icon="car"
        value={data.pickups_today.total}
        label="Pickups today"
        helper={data.pickups_today.needs_driver ? `${data.pickups_today.needs_driver} need a driver` : 'All covered'}
        href="/transport"
      />
      <StatTile
        tone="rooms"
        icon="bed"
        value={data.rooms.ready}
        label="Rooms ready"
        helper={waiting ? `${waiting} waiting for sanitation` : `${data.rooms.total} rooms in total`}
        href="/rooms"
      />
      <StatTile
        tone="approvals"
        icon="check"
        value={data.decisions_pending}
        label="To approve"
        helper={data.decisions_pending ? 'Review them below' : 'Nothing waiting'}
        href="#approvals"
      />
    </section>
  )
}

// Event access is per person (P9): a Programme Manager sees only events they own, other staff
// only events they were added to. With none, the figures would all be 0, so say why instead.
function NoEventNotice() {
  const { user } = useSession()
  const managesEvents = hasAnyRole(user.role, EVENT_MANAGERS)
  return (
    <div className="error-banner" role="note">
      <Icon name="info" />
      {managesEvents ? (
        <span>
          You are not working in any event yet. Create a new event, or ask a Super Admin to hand one to you.{' '}
          <Link href="/events">Open Events</Link>
        </span>
      ) : (
        <span>You are not working in any event yet. Ask your Programme Manager to add you to their event team.</span>
      )}
    </div>
  )
}

export function DashboardScreen() {
  const { event } = useSession()
  if (!event) {
    return (
      <main className="dashboard-page">
        <Hero />
        <NoEventNotice />
      </main>
    )
  }
  return (
    <main className="dashboard-page">
      <Hero />
      <StatsRow />
      <div className="main-grid-v4">
        <div className="main-left">
          <ApprovalsCard />
        </div>
        <aside className="main-right">
          <ProgrammeRiskCard />
          <RecentActivityCard />
        </aside>
      </div>
      <section className="card-v4 quick-card" aria-labelledby="quick-title">
        <header>
          <h2 id="quick-title">Quick actions</h2>
        </header>
        <div className="quick-grid">
          {QUICK_ACTIONS.map((action) => (
            <Link className="quick-action" href={action.href} key={action.title}>
              <span className={`quick-icon quick-icon--${action.tone}`}>
                <Icon name={action.icon} />
              </span>
              <b>{action.title}</b>
              <small>{action.helper}</small>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
