'use client'
// The party's rooms on the guest profile (FR-RA-06): each member's room or pending suggestion,
// and "Change room" / "Assign a room", which open the move dialog with its rule checks.
import Link from 'next/link'
import { useState } from 'react'
import { MoveDialog, roomChoices } from '@/features/rooms/MoveDialog'
import { guestName } from '@/features/intake/model'
import { formatShortDay } from '@/lib/client/format'
import { useApi } from '@/lib/client/use-api'
import type { RoomsBoard } from '@/lib/repositories/rooms-board'
import { ProfileCard } from './ProfileCards'
import type { GuestProfile } from './types'

interface Target {
  readonly id: string
  readonly name: string
}

function Dialog({ target, onClose }: { readonly target: Target; readonly onClose: () => void }) {
  const { data: board } = useApi<RoomsBoard>('/api/rooms/board')
  if (!board) return null
  return <MoveDialog guest={target} rooms={roomChoices(board.rooms)} onClose={onClose} />
}

export function RoomCard({ profile, timeZone }: { readonly profile: GuestProfile; readonly timeZone: string }) {
  const [target, setTarget] = useState<Target | null>(null)
  const stays = profile.stays ?? []
  const suggestions = profile.room_suggestions ?? []
  const { guest } = profile
  return (
    <ProfileCard title="Room" className="room-profile-card">
      <div className="profile-rooms">
        {profile.members.map((member) => {
          const name = member.full_name ? guestName(member.title, member.full_name) : 'Name to follow'
          const stay = stays.find((item) => item.guest_id === member.id)
          const suggestion = suggestions.find((item) => item.guest_id === member.id)
          return (
            <div className="profile-room-row" key={member.id}>
              <div>
                <b>{name}</b>
                {stay ? (
                  <small>
                    Room <strong>{stay.number}</strong> · {stay.room_type} · {stay.wing} wing, floor {stay.floor} · {stay.status === 'checked_in' ? 'Checked in' : `From ${formatShortDay(stay.expected_check_in_at, timeZone)}`}
                    {stay.is_manual_override ? ' · placed by hand' : ''}
                  </small>
                ) : suggestion ? (
                  <small>
                    Suggested: room {suggestion.room_number ?? '?'} ·{' '}
                    <Link href={suggestion.parent_id ? `/rooms/plan/${suggestion.parent_id}` : '/dashboard#approvals'}>waiting for approval</Link>
                  </small>
                ) : (
                  <small>No room yet</small>
                )}
              </div>
              <button type="button" className="hm-button hm-button--ghost" onClick={() => setTarget({ id: member.id, name })}>
                <span>{stay ? 'Change room' : 'Assign a room'}</span>
              </button>
            </div>
          )
        })}
      </div>
      <p className="profile-room-note">
        Proximity priority: {guest.proximity_priority}
        {guest.share_group ? ` · shares a room with group “${guest.share_group}”` : ''}.
      </p>
      {target ? <Dialog target={target} onClose={() => setTarget(null)} /> : null}
    </ProfileCard>
  )
}
