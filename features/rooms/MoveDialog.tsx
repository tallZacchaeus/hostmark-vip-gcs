'use client'
// Assign or move a guest by hand (FR-RA-06, Figma "Move room" warning). The coordinator picks a
// room; the dry run shows any broken rule and lost preference first, and then "Assign anyway"
// needs a reason, which goes to the activity log. A clean move is one tap.
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { ApiClientError, apiSend } from '@/lib/client/api'
import { useAction } from '@/lib/client/use-action'
import { refreshApi } from '@/lib/client/use-api'
import type { MoveCheck } from '@/lib/services/rooms/check'
import { MIN_OVERRIDE_REASON } from '@/lib/validation/rooms'

export interface RoomChoice {
  readonly id: string
  readonly number: string
  readonly label: string
}

interface MoveDialogProps {
  readonly guest: { readonly id: string; readonly name: string }
  readonly rooms: readonly RoomChoice[]
  readonly initialRoomId?: string
  readonly onClose: () => void
}

const STATUS_WORDS = { met: 'High', partly: 'Partial', missed: 'Low' } as const
const STATUS_TONES = { met: 'success', partly: 'warning', missed: 'error' } as const

function RoomStrip({ check }: { readonly check: MoveCheck }) {
  return (
    <div className="move-room-strip">
      {check.from_room ? (
        <div>
          <b>{check.from_room.number}</b>
          <span>
            <strong>{check.from_room.type}</strong>
            <small>
              {check.from_room.wing} wing · F{check.from_room.floor}
            </small>
          </span>
        </div>
      ) : (
        <div>
          <b>–</b>
          <span>
            <strong>No room yet</strong>
          </span>
        </div>
      )}
      <Icon name="arrow" size={18} />
      <div className="move-to-room">
        <b>{check.to_room.number}</b>
        <span>
          <strong>
            {check.to_room.type}
            {check.to_room.is_accessible ? ', accessible' : ''}
          </strong>
          <small>
            {check.to_room.wing} wing · F{check.to_room.floor}
          </small>
        </span>
      </div>
    </div>
  )
}

function Warnings({ check }: { readonly check: MoveCheck }) {
  return (
    <>
      {check.violations.length > 0 ? (
        <section className="move-warning-section">
          <h3>{check.violations.length === 1 ? 'BROKEN RULE' : 'BROKEN RULES'}</h3>
          {check.violations.map((violation) => (
            <div className="broken-rule" key={violation.code}>
              <Icon name="alert" size={18} />
              <span>{violation.text}</span>
            </div>
          ))}
        </section>
      ) : null}
      {check.losses.length > 0 ? (
        <section className="move-warning-section">
          <h3>WHAT YOU LOSE</h3>
          {check.losses.map((loss) => (
            <div className="move-loss" key={loss.code}>
              <p>
                <b>{loss.code === 'proximity' ? 'Proximity to the principal' : loss.code === 'tier' ? 'Room tier' : loss.code === 'accessible' ? 'Accessible room' : 'Ground floor'}</b>
                {loss.before ? <span className={`arrival-badge arrival-badge--${STATUS_TONES[loss.before]}`}>{STATUS_WORDS[loss.before]}</span> : null}
                <Icon name="arrow" size={16} />
                <span className={`arrival-badge arrival-badge--${STATUS_TONES[loss.after]}`}>{STATUS_WORDS[loss.after]}</span>
              </p>
              <span>
                <Icon name="pin" size={16} />
                {loss.text}
              </span>
            </div>
          ))}
        </section>
      ) : null}
    </>
  )
}

function headline(check: MoveCheck): string {
  if (check.violations.length > 0) return `This move breaks ${check.violations.length === 1 ? '1 rule' : `${check.violations.length} rules`}`
  if (check.losses.length > 0) return `This move loses ${check.losses.length === 1 ? 'a preference' : `${check.losses.length} preferences`}`
  return check.from_room ? `Move to room ${check.to_room.number}?` : `Assign room ${check.to_room.number}?`
}

export function MoveDialog({ guest, rooms, initialRoomId, onClose }: MoveDialogProps) {
  const titleId = useId()
  const toast = useToast()
  const action = useAction()
  const [roomId, setRoomId] = useState(initialRoomId ?? '')
  const [check, setCheck] = useState<MoveCheck | null>(null)
  const [reason, setReason] = useState('')

  // The room currently picked, so a slow check for an earlier pick never replaces a newer one.
  const latestRoom = useRef(roomId)

  const runCheck = async (id: string) => {
    const result = await apiSend<MoveCheck>('/api/room-assignments/check', 'POST', { guest_id: guest.id, room_id: id })
    if (latestRoom.current === id) setCheck(result)
  }
  const choose = (id: string) => {
    latestRoom.current = id
    setRoomId(id)
    setCheck(null)
    setReason('')
    if (id) void action.run(() => runCheck(id))
  }
  // A room chosen before the dialog opened gets the same dry run as a manual pick.
  useEffect(() => {
    if (initialRoomId) void action.run(() => runCheck(initialRoomId))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the room given on open; later picks go through choose()
  }, [initialRoomId])

  const assign = () =>
    action.run(async () => {
      // Every warning shown is acknowledged; if something changed since, the check is refreshed.
      const acknowledged = check ? [...check.violations.map((violation) => violation.code), ...check.losses.map((loss) => loss.code)] : []
      try {
        const result = await apiSend<{ room_number: string }>('/api/room-assignments', 'POST', { guest_id: guest.id, room_id: roomId, reason: reason.trim() || null, acknowledged })
        toast.show({ message: check?.needs_confirmation ? `Room ${result.room_number} assigned. Reason saved in Activity.` : `${guest.name} is now in room ${result.room_number}.` })
      } catch (caught: unknown) {
        if (caught instanceof ApiClientError && caught.code === 'needs_confirmation') await runCheck(roomId)
        throw caught
      }
      await refreshApi('/api/rooms', '/api/guests', '/api/front-desk', '/api/allocation', '/api/audit', '/api/dashboard')
      onClose()
    })
  const needsReason = Boolean(check?.needs_confirmation)
  const reasonShort = needsReason && reason.trim().length < MIN_OVERRIDE_REASON

  return (
    <Modal onClose={onClose} scrimClassName="move-warning-scrim" className="move-warning-dialog" labelledBy={titleId}>
      <header>
        <span>
          <Icon name={needsReason ? 'alert' : 'bed'} size={22} />
        </span>
        <h2 id={titleId}>{check ? headline(check) : `Room for ${guest.name}`}</h2>
        <button type="button" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <div className="move-warning-body">
        <label className="move-reason">
          <span>Room</span>
          <select value={roomId} onChange={(event) => choose(event.target.value)} aria-label="Room">
            <option value="">Choose a room</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.number} · {room.label}
              </option>
            ))}
          </select>
        </label>
        {check ? (
          <>
            <p className="move-story">
              {check.from_room ? 'Move' : 'Assign'} <b>{check.guest.name}</b> ({check.guest.role.toLowerCase()}, {check.guest.delegation}){' '}
              {check.from_room ? (
                <>
                  from room <b>{check.from_room.number}</b> to room <b>{check.to_room.number}</b>.
                </>
              ) : (
                <>
                  to room <b>{check.to_room.number}</b>.
                </>
              )}
            </p>
            <RoomStrip check={check} />
            <Warnings check={check} />
            {needsReason ? (
              <label className="move-reason">
                <span>
                  Reason for assigning anyway <b>*</b>
                </span>
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={1000} />
                <small>
                  <Icon name="activity" size={14} />
                  At least {MIN_OVERRIDE_REASON} characters. This is saved in the activity log.
                </small>
              </label>
            ) : null}
          </>
        ) : null}
        {action.error ? (
          <p className="form-error" role="alert">
            {action.error}
          </p>
        ) : null}
      </div>
      <footer>
        <Button onClick={onClose}>Cancel</Button>
        <button type="button" className="assign-anyway" disabled={!check || action.busy || reasonShort} onClick={() => void assign()}>
          {needsReason ? 'Assign anyway' : 'Assign'}
        </button>
      </footer>
    </Modal>
  )
}

export const roomChoices = (rooms: readonly { id: string; number: string; type_name: string; wing: string; floor: number; status: string }[]): RoomChoice[] =>
  [...rooms]
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
    .map((room) => ({ id: room.id, number: room.number, label: `${room.type_name}, ${room.wing} F${room.floor}${room.status === 'ready' ? '' : ` (${room.status.replace(/-/g, ' ')})`}` }))

