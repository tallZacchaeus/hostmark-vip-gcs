'use client'
// Venue setup (FR-PL-04): room types with cleaning times, and the room list (manual or CSV).
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Pill, Skeleton } from '@/components/ui/Status'
import { useToast } from '@/components/ui/Toast'
import { errorMessage, withQuery } from '@/lib/client/api'
import { refreshApi, useApi } from '@/lib/client/use-api'
import { ConfirmDelete } from './ConfirmDelete'
import { RoomDialog, RoomImportDialog, RoomTypeDialog } from './RoomDialogs'
import type { Room, RoomType } from './types'

type Dialog =
  | { readonly type: 'roomType'; readonly roomType: RoomType | null }
  | { readonly type: 'room'; readonly room: Room | null }
  | { readonly type: 'import' }
  | { readonly type: 'delete'; readonly label: string; readonly path: string }
  | null

function roomStatus(room: Room): { label: string; tone: 'success' | 'warning' | 'info' | 'neutral' } {
  if (room.out_of_service) return { label: 'Out of service', tone: 'neutral' }
  if (room.housekeeping_status === 'needs_cleaning') return { label: 'Needs cleaning', tone: 'warning' }
  if (room.housekeeping_status === 'cleaning') return { label: 'Cleaning', tone: 'info' }
  return { label: 'Clean', tone: 'success' }
}

export function RoomsTab() {
  const toast = useToast()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [floor, setFloor] = useState('')
  const [wing, setWing] = useState('')
  const types = useApi<RoomType[]>('/api/admin/room-types?limit=200')
  const rooms = useApi<Room[]>(withQuery('/api/admin/rooms', { limit: 200, floor: floor || undefined, wing: wing || undefined }))
  const typeName = new Map((types.data ?? []).map((type) => [type.id, type.name]))
  const wings = [...new Set((rooms.data ?? []).map((room) => room.wing))].sort()
  const close = () => setDialog(null)
  const saved = (message: string) => {
    close()
    toast.show({ message })
    void refreshApi('/api/admin/room-types', '/api/admin/rooms', '/api/dashboard')
  }

  return (
    <div className="settings-section">
      <section className="data-card" aria-labelledby="room-types-title">
        <header>
          <div>
            <h2 id="room-types-title">Room types</h2>
            <p>Tier, default capacity and the fixed cleaning time used for ready-time estimates.</p>
          </div>
          <div>
            <Button kind="primary" icon="plus" onClick={() => setDialog({ type: 'roomType', roomType: null })}>
              Add room type
            </Button>
          </div>
        </header>
        {types.error ? <ErrorBanner className="settings-error" message={errorMessage(types.error)} onRetry={() => void types.mutate()} /> : null}
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="num">Tier</th>
                <th className="num">Capacity</th>
                <th className="num">Cleaning (min)</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(types.data ?? []).map((type) => (
                <tr key={type.id}>
                  <td>{type.name}</td>
                  <td className="num">{type.tier}</td>
                  <td className="num">{type.default_capacity}</td>
                  <td className="num">{type.cleaning_minutes}</td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="icon-button" aria-label={`Edit ${type.name}`} onClick={() => setDialog({ type: 'roomType', roomType: type })}>
                        <Icon name="edit" size={17} />
                      </button>
                      <button
                        type="button"
                        className="icon-button is-danger"
                        aria-label={`Delete ${type.name}`}
                        onClick={() => setDialog({ type: 'delete', label: `room type ${type.name}`, path: `/api/admin/room-types/${type.id}` })}
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {types.isLoading && <Skeleton className="sk-wide" />}
        </div>
      </section>

      <section className="data-card" aria-labelledby="rooms-title">
        <header>
          <div>
            <h2 id="rooms-title">Rooms</h2>
            <p>{rooms.meta ? `${rooms.meta.total} rooms` : 'Loading…'}</p>
          </div>
          <div>
            <select aria-label="Filter by floor" className="compact-select" value={floor} onChange={(event) => setFloor(event.target.value)}>
              <option value="">All floors</option>
              {[1, 2, 3, 4, 5, 6].map((value) => (
                <option key={value} value={value}>
                  Floor {value}
                </option>
              ))}
            </select>
            <select aria-label="Filter by wing" className="compact-select" value={wing} onChange={(event) => setWing(event.target.value)}>
              <option value="">All wings</option>
              {wings.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <Button icon="upload" onClick={() => setDialog({ type: 'import' })}>
              Import CSV
            </Button>
            <Button kind="primary" icon="plus" disabled={(types.data ?? []).length === 0} onClick={() => setDialog({ type: 'room', room: null })}>
              Add room
            </Button>
          </div>
        </header>
        {rooms.error ? <ErrorBanner className="settings-error" message={errorMessage(rooms.error)} onRetry={() => void rooms.mutate()} /> : null}
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Room</th>
                <th className="num">Floor</th>
                <th>Wing</th>
                <th>Type</th>
                <th className="num">Capacity</th>
                <th>Status</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(rooms.data ?? []).map((room) => {
                const status = roomStatus(room)
                return (
                  <tr key={room.id} className={room.out_of_service ? 'is-muted' : ''}>
                    <td>
                      <code>{room.number}</code>
                      {room.is_accessible && <span className="visually-hidden"> (accessible)</span>}
                      {room.is_accessible && <Icon name="accessibility" size={15} />}
                    </td>
                    <td className="num">{room.floor}</td>
                    <td>{room.wing}</td>
                    <td>{typeName.get(room.room_type_id) ?? '—'}</td>
                    <td className="num">{room.capacity}</td>
                    <td>
                      <Pill tone={status.tone}>{status.label}</Pill>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="icon-button" aria-label={`Edit room ${room.number}`} onClick={() => setDialog({ type: 'room', room })}>
                          <Icon name="edit" size={17} />
                        </button>
                        <button
                          type="button"
                          className="icon-button is-danger"
                          aria-label={`Delete room ${room.number}`}
                          onClick={() => setDialog({ type: 'delete', label: `room ${room.number}`, path: `/api/admin/rooms/${room.id}` })}
                        >
                          <Icon name="trash" size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {rooms.isLoading && <Skeleton className="sk-wide" />}
          {rooms.meta && rooms.meta.total > rooms.meta.limit && (
            <p className="activity-more">Showing {rooms.meta.limit} of {rooms.meta.total}. Filter by floor or wing to see the rest.</p>
          )}
        </div>
      </section>

      {dialog?.type === 'roomType' && <RoomTypeDialog roomType={dialog.roomType} onClose={close} onSaved={() => saved('Room type saved.')} />}
      {dialog?.type === 'room' && <RoomDialog room={dialog.room} roomTypes={types.data ?? []} onClose={close} onSaved={() => saved('Room saved.')} />}
      {dialog?.type === 'import' && (
        <RoomImportDialog onClose={close} onImported={(summary) => saved(`Imported ${summary.rows} rooms: ${summary.created} new, ${summary.updated} updated.`)} />
      )}
      {dialog?.type === 'delete' && <ConfirmDelete label={dialog.label} path={dialog.path} onClose={close} onDeleted={() => saved('Deleted.')} />}
    </div>
  )
}
