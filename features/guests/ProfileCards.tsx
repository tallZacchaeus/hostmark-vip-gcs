'use client'
// The guest profile's cards (Figma profile): party, arrival, transport, room, open issues and
// history. Each card shows only what exists; later phases fill transport and room.
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { AutoTag, Pill, StatusChip } from '@/components/ui/Status'
import { MEMBER_ROLE_LABELS, PARTY_ROLE_LABELS, REQUIREMENT_LABELS, guestName } from '@/features/intake/model'
import { type AuditEntry, actorLabel, objectOf, verbOf } from '@/lib/client/activity-format'
import { formatDayTime, formatShortDay, formatTime, initials } from '@/lib/client/format'
import { PARTY_ROLES, type PartyRole } from '@/lib/domain/intake/schema'
import { FlightTimeEditor } from './FlightTimeEditor'
import { type GuestProfile, PICKUP_STATUS, type Requirement } from './types'

export function ProfileCard({ title, className = '', children }: { readonly title: string; readonly className?: string; readonly children: React.ReactNode }) {
  return (
    <section className={`profile-card ${className}`} aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  )
}

interface PartyCardProps {
  readonly profile: GuestProfile
  readonly busy: boolean
  readonly onAdd: (name: string, role: PartyRole) => void
  readonly onRemove: (memberId: string) => void
}

export function PartyCard({ profile, busy, onAdd, onRemove }: PartyCardProps) {
  const [name, setName] = useState('')
  const [role, setRole] = useState<PartyRole>('assistant')
  return (
    <ProfileCard title="Party" className="party-card">
      <div className="party-list">
        {profile.members.map((member) => {
          const display = member.full_name ? guestName(member.title, member.full_name) : 'Name to follow'
          return (
            <div className="party-row" key={member.id}>
              <span className="party-avatar" aria-hidden="true">
                {member.full_name ? initials(member.full_name) : '?'}
              </span>
              <div>
                <b>{display}</b>
                <small>{MEMBER_ROLE_LABELS[member.member_role]}</small>
              </div>
              <span className="party-room">
                {member.member_role !== 'principal' && (
                  <button type="button" className="icon-button is-danger" aria-label={`Remove ${display} from the party`} onClick={() => onRemove(member.id)} disabled={busy}>
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </span>
            </div>
          )
        })}
      </div>
      <form
        className="party-add"
        onSubmit={(event) => {
          event.preventDefault()
          onAdd(name, role)
          setName('')
        }}
      >
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name (optional)" aria-label="New member name" />
        <select value={role} onChange={(event) => setRole(event.target.value as PartyRole)} aria-label="New member role">
          {PARTY_ROLES.map((value) => (
            <option key={value} value={value}>
              {PARTY_ROLE_LABELS[value]}
            </option>
          ))}
        </select>
        <Button type="submit" icon="plus" busy={busy}>
          Add
        </Button>
      </form>
    </ProfileCard>
  )
}

const PHASE_LABELS: Readonly<Record<string, string>> = {
  scheduled: 'Scheduled',
  in_air: 'In the air',
  landed: 'Landed',
  cancelled: 'Cancelled',
  diverted: 'Diverted',
  unknown: 'Status unknown',
}

export function ArrivalCard({ profile, timeZone }: { readonly profile: GuestProfile; readonly timeZone: string }) {
  const { arrival, flight } = profile
  if (!arrival) {
    return (
      <ProfileCard title="Arrival" className="arrival-profile-card">
        <p>No arrival recorded.</p>
      </ProfileCard>
    )
  }
  const when = flight?.manual_arrival_at ?? flight?.actual_arrival_at ?? flight?.estimated_arrival_at ?? flight?.scheduled_arrival_at ?? arrival.stated_arrival_at ?? arrival.requested_pickup_at
  const route = flight ? [flight.origin_iata, flight.destination_iata].filter(Boolean).join(' to ') : ''
  return (
    <ProfileCard title="Arrival" className="arrival-profile-card">
      <p className="profile-lead">
        {flight ? (
          <>
            <b>{flight.flight_number}</b>
            {route && ` · ${route}`}
          </>
        ) : arrival.mode === 'pickup' ? (
          <>Pickup from {arrival.pickup_address}</>
        ) : (
          <>Arriving by their own transport</>
        )}
      </p>
      <div className="profile-time">
        <strong>{when ? `${formatShortDay(when, timeZone)} ${formatTime(when, timeZone)}` : 'Time to follow'}</strong>
        {flight && <StatusChip tone="neutral">{PHASE_LABELS[flight.phase] ?? flight.phase}</StatusChip>}
      </div>
      {arrival.expected_at_venue_at && (
        <p>
          Expected at the venue <b>{formatTime(arrival.expected_at_venue_at, timeZone)}</b>
        </p>
      )}
      {flight && !when && <p>The landing time will be filled in from flight tracking.</p>}
      {flight && <FlightTimeEditor flightId={flight.id} manualArrivalAt={flight.manual_arrival_at} landingAt={when ?? null} timeZone={timeZone} />}
    </ProfileCard>
  )
}

export function TransportCard({ profile, timeZone }: { readonly profile: GuestProfile; readonly timeZone: string }) {
  const { pickup, arrival } = profile
  return (
    <ProfileCard title="Transport" className="transport-profile-card">
      {pickup ? (
        <div className="profile-facts">
          <p>
            <span>Pickup</span>
            <b>{formatDayTime(pickup.pickup_at, timeZone)}</b>
          </p>
          <p>
            <span>Location</span>
            <b>{pickup.pickup_location}</b>
          </p>
          <p>
            <span>Passengers</span>
            <b>{pickup.passenger_count}</b>
          </p>
          <p>
            <span>Driver</span>
            <b>
              <Pill tone={PICKUP_STATUS[pickup.status].tone}>{PICKUP_STATUS[pickup.status].label}</Pill>
            </b>
          </p>
        </div>
      ) : (
        <p>{arrival?.mode === 'own_transport' ? 'No pickup needed: arriving by their own transport.' : 'A pickup is booked once the landing time is known.'}</p>
      )}
    </ProfileCard>
  )
}

interface IssuesCardProps {
  readonly requirements: readonly Requirement[]
  readonly busy: boolean
  readonly onResolve: (requirement: Requirement) => void
  readonly onAddAsGuest: (requirement: Requirement) => void
}

export function IssuesCard({ requirements, busy, onResolve, onAddAsGuest }: IssuesCardProps) {
  const open = requirements.filter((item) => item.needs_attention && !item.resolved_at)
  const notes = requirements.filter((item) => !item.needs_attention)
  return (
    <ProfileCard title="Open issues" className="issues-profile-card">
      {open.length === 0 ? (
        <div className="profile-empty">
          <span>
            <Icon name="check" />
          </span>
          <b>Nothing needs attention.</b>
        </div>
      ) : (
        open.map((item) => (
          <div className="issue-item" key={item.id}>
            <b>{item.detail}</b>
            <small>
              {REQUIREMENT_LABELS[item.category]}
              {item.conflicts_with ? ` · contradicts ${item.conflicts_with.replace(/_/g, ' ')}` : ''}
              {item.reference_code ? ` · from ${item.submission_source === 'pasted_message' ? 'pasted message' : 'registration'} ${item.reference_code}` : ''}
            </small>
            <div>
              {(item.category === 'schedule' || item.category === 'other') && (
                <Button kind="approve" onClick={() => onAddAsGuest(item)} disabled={busy}>
                  Add as guest
                </Button>
              )}
              <Button kind="ghost" onClick={() => onResolve(item)} disabled={busy}>
                Dismiss
              </Button>
            </div>
          </div>
        ))
      )}
      {notes.length > 0 && (
        <ul className="profile-notes" aria-label="Requirements">
          {notes.map((item) => (
            <li key={item.id}>
              <b>{REQUIREMENT_LABELS[item.category]}:</b> {item.detail}
            </li>
          ))}
        </ul>
      )}
    </ProfileCard>
  )
}

interface HistoryCardProps {
  readonly history: readonly AuditEntry[]
  readonly timeZone: string
  readonly undoing: string | null
  readonly onUndo: (entry: AuditEntry) => void
}

export function HistoryCard({ history, timeZone, undoing, onUndo }: HistoryCardProps) {
  return (
    <ProfileCard title="History" className="history-profile-card">
      {history.length === 0 ? (
        <p>No changes recorded yet.</p>
      ) : (
        <div className="history-list">
          {history.map((entry) => (
            <div className={`history-item ${entry.undone ? 'is-undone' : ''}`} key={entry.id}>
              <i aria-hidden="true" />
              <time dateTime={entry.occurred_at}>{formatTime(entry.occurred_at, timeZone)}</time>
              {entry.is_automatic ? <AutoTag /> : <span className="history-chip-spacer" />}
              <span title={`${actorLabel(entry)} ${verbOf(entry.action)} ${objectOf(entry).label}`}>
                {actorLabel(entry)} {verbOf(entry.action)} {objectOf(entry).label}
              </span>
              {entry.undoable && (
                <button type="button" onClick={() => onUndo(entry)} disabled={entry.undone || undoing === entry.id}>
                  {entry.undone ? 'Undone' : 'Undo'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </ProfileCard>
  )
}
