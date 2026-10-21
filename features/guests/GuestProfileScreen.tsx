'use client'
// Guest profile (03-App-Flow.md /guests/[id]): the party, arrival, transport, room, open issues and
// history with Undo. The coordinator sets category, proximity and room sharing here (FR-IN-11).
import Link from 'next/link'
import { useState } from 'react'
import { ErrorBanner } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Pill, Skeleton, StatusChip, type Tone } from '@/components/ui/Status'
import { useToast } from '@/components/ui/Toast'
import { useTimeZone } from '@/components/shell/SessionContext'
import { guestName } from '@/features/intake/model'
import type { VipCategory } from '@/features/settings/types'
import type { AuditEntry } from '@/lib/client/activity-format'
import { ApiClientError, apiSend } from '@/lib/client/api'
import { plural } from '@/lib/client/format'
import { refreshApi, useApi } from '@/lib/client/use-api'
import { useAction } from '@/lib/client/use-action'
import type { PartyRole } from '@/lib/domain/intake/schema'
import { EditGuestDialog } from './EditGuestDialog'
import { ArrivalCard, HistoryCard, IssuesCard, PartyCard, ProfileCard, TransportCard } from './ProfileCards'
import { RoomCard } from './RoomCard'
import { type GuestProfile, PICKUP_STATUS, type Requirement } from './types'

function Loading() {
  return (
    <main className="profile-page" aria-busy="true">
      <div className="profile-grid profile-loading">
        <div>
          {[0, 1, 2].map((index) => (
            <section className="profile-card" key={index}>
              <Skeleton className="profile-sk-title" />
              <Skeleton className="profile-sk-wide" />
              <Skeleton className="profile-sk-short" />
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}

/** The guest's own room: checked in, kept, suggested or not planned. */
function roomPill(profile: GuestProfile): { readonly label: string; readonly tone: Tone | 'suggested' } {
  const stay = profile.stays?.find((item) => item.guest_id === profile.guest.id)
  if (stay) return stay.status === 'checked_in' ? { label: `Room ${stay.number}: checked in`, tone: 'success' } : { label: `Room ${stay.number}`, tone: 'info' }
  const suggestion = profile.room_suggestions?.find((item) => item.guest_id === profile.guest.id)
  if (suggestion?.room_number) return { label: `Room ${suggestion.room_number} suggested`, tone: 'suggested' }
  return { label: 'Room: not planned yet', tone: 'neutral' }
}

function Badges({ profile, openIssues }: { readonly profile: GuestProfile; readonly openIssues: number }) {
  const arrived = profile.arrival?.status === 'arrived'
  const room = roomPill(profile)
  return (
    <div className="profile-badges">
      <StatusChip tone={arrived ? 'success' : 'neutral'}>{arrived ? 'Arrival: Arrived' : 'Arrival: Expected'}</StatusChip>
      {profile.pickup ? <StatusChip tone={PICKUP_STATUS[profile.pickup.status].tone}>{`Transport: ${PICKUP_STATUS[profile.pickup.status].label}`}</StatusChip> : null}
      <Pill tone={room.tone}>{room.label}</Pill>
      {openIssues > 0 && <StatusChip tone="warning">{`${plural(openIssues, 'open issue')}`}</StatusChip>}
    </div>
  )
}

export function GuestProfileScreen({ id }: { readonly id: string }) {
  const timeZone = useTimeZone()
  const toast = useToast()
  const { data, error, mutate } = useApi<GuestProfile>(`/api/guests/${id}`)
  const categories = useApi<VipCategory[]>('/api/admin/vip-categories?limit=200')
  const [editing, setEditing] = useState(false)
  const [undoing, setUndoing] = useState<string | null>(null)
  const action = useAction()

  if (error && !data) {
    const missing = error instanceof ApiClientError && error.status === 404
    return (
      <main className="profile-page">
        <Link className="profile-breadcrumb" href="/guests">
          Guests <Icon name="arrow" size={14} />
        </Link>
        <ErrorBanner className="profile-error" message={missing ? 'This guest does not exist.' : "We couldn't load this guest."} onRetry={missing ? undefined : () => void mutate()} />
      </main>
    )
  }
  if (!data) return <Loading />

  const { guest, delegation } = data
  const name = guestName(guest.title, guest.full_name)
  const openIssues = data.requirements.filter((item) => item.needs_attention && !item.resolved_at).length
  const changed = (message: string) => {
    void mutate()
    void refreshApi('/api/guests', '/api/dashboard')
    toast.show({ message })
  }
  const addMember = (memberName: string, role: PartyRole, requirement?: Requirement) =>
    action.run(async () => {
      await apiSend(`/api/delegations/${delegation.id}/members`, 'POST', { member_role: role, full_name: memberName, ...(requirement ? { requirement_id: requirement.id } : {}) })
      changed(memberName ? `${memberName} added to the party` : 'Added to the party')
    })
  const removeMember = (memberId: string) =>
    action.run(async () => {
      await apiSend(`/api/guests/${memberId}`, 'DELETE')
      changed('Removed from the party')
    })
  const resolve = (requirement: Requirement) =>
    action.run(async () => {
      await apiSend(`/api/guest-requirements/${requirement.id}/resolve`, 'POST', {})
      changed('Issue dismissed')
    })
  const undo = async (entry: AuditEntry) => {
    setUndoing(entry.id)
    const ok = await action.run(() => apiSend(`/api/audit/${entry.id}/undo`, 'POST', {}))
    setUndoing(null)
    if (ok) changed('Change undone')
  }

  return (
    <main className="profile-page">
      <Link className="profile-breadcrumb" href="/guests">
        Guests <Icon name="arrow" size={14} />
        <span>{name}</span>
      </Link>
      <header className="profile-header">
        <div className="profile-title-area">
          <div className="profile-title-line">
            <h1>{name}</h1>
            <span className="category-chip profile-category">{guest.category_name ?? 'No category'}</span>
            <button type="button" className="profile-edit-button" onClick={() => setEditing(true)}>
              <Icon name="edit" size={15} />
              Edit
            </button>
          </div>
          <p>
            {guest.member_role === 'principal' ? `Party of ${data.members.length}` : `Part of ${delegation.name}`}
            {guest.dietary.length > 0 && ` · ${guest.dietary.join(', ')}`}
            {guest.organisation && ` · ${guest.organisation}`}
          </p>
        </div>
      </header>
      <Badges profile={data} openIssues={openIssues} />
      {action.error && <ErrorBanner className="profile-error" message={action.error} />}
      <div className="profile-grid">
        <div className="profile-main">
          <PartyCard profile={data} busy={action.busy} onAdd={(memberName, role) => void addMember(memberName, role)} onRemove={(memberId) => void removeMember(memberId)} />
          <ArrivalCard profile={data} timeZone={timeZone} />
          <TransportCard profile={data} timeZone={timeZone} />
          <RoomCard profile={data} timeZone={timeZone} />
          {(delegation.contact_name || delegation.contact_email || delegation.contact_phone) && (
            <ProfileCard title="Contact" className="contact-profile-card">
              <div className="profile-facts">
                {delegation.contact_name && (
                  <p>
                    <span>Name</span>
                    <b>{delegation.contact_name}</b>
                  </p>
                )}
                {delegation.contact_phone && (
                  <p>
                    <span>Phone</span>
                    <b>
                      <a href={`tel:${delegation.contact_phone}`}>{delegation.contact_phone}</a>
                    </b>
                  </p>
                )}
                {delegation.contact_email && (
                  <p>
                    <span>Email</span>
                    <b>
                      <a href={`mailto:${delegation.contact_email}`}>{delegation.contact_email}</a>
                    </b>
                  </p>
                )}
              </div>
            </ProfileCard>
          )}
        </div>
        <aside className="profile-side">
          <IssuesCard
            requirements={data.requirements}
            busy={action.busy}
            onResolve={(item) => void resolve(item)}
            onAddAsGuest={(item) => void addMember('', 'other', item)}
          />
          <HistoryCard history={data.history} timeZone={timeZone} undoing={undoing} onUndo={(entry) => void undo(entry)} />
          {data.submissions.length > 0 && (
            <ProfileCard title="Registrations" className="submissions-profile-card">
              <ul className="profile-notes">
                {data.submissions.map((submission) => (
                  <li key={submission.id}>
                    <Link href={`/intake/${submission.id}`}>{submission.reference_code}</Link> · {submission.source === 'form' ? 'Registration form' : 'Pasted message'}
                  </li>
                ))}
              </ul>
            </ProfileCard>
          )}
        </aside>
      </div>
      {editing && (
        <EditGuestDialog
          guest={guest}
          categories={categories.data ?? []}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            changed('Guest updated')
          }}
        />
      )}
    </main>
  )
}
