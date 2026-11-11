'use client'
import { useState } from 'react'
import { Field, FormDialog, unmet } from '@/components/ui/FormDialog'
import { apiRequest, apiSend } from '@/lib/client/api'
import { useAction } from '@/lib/client/use-action'
import type { Room, RoomType } from './types'

const toInt = (value: string): number => Number.parseInt(value, 10)

export function RoomTypeDialog({ roomType, onClose, onSaved }: { readonly roomType: RoomType | null; readonly onClose: () => void; readonly onSaved: () => void }) {
  const [name, setName] = useState(roomType?.name ?? '')
  const [tier, setTier] = useState(String(roomType?.tier ?? 1))
  const [capacity, setCapacity] = useState(String(roomType?.default_capacity ?? 2))
  const [minutes, setMinutes] = useState(String(roomType?.cleaning_minutes ?? 45))
  const action = useAction()
  const submit = () =>
    void action.run(async () => {
      const body = { name: name.trim(), tier: toInt(tier), default_capacity: toInt(capacity), cleaning_minutes: toInt(minutes) }
      await (roomType ? apiSend(`/api/admin/room-types/${roomType.id}`, 'PATCH', body) : apiSend('/api/admin/room-types', 'POST', body))
      onSaved()
    })
  return (
    <FormDialog
      title={roomType ? 'Edit room type' : 'Add room type'}
      submitLabel={roomType ? 'Save' : 'Add room type'}
      onSubmit={submit}
      onClose={onClose}
      busy={action.busy}
      error={action.error}
      missing={unmet([[name.trim() !== '', 'Enter a name']])}
    >
      <Field label="Name" required>
        <input value={name} onChange={(event) => setName(event.target.value)} data-autofocus />
      </Field>
      <Field label="Tier" hint="1 is the best rooms; matched against VIP categories">
        <input type="number" min={1} max={99} value={tier} onChange={(event) => setTier(event.target.value)} />
      </Field>
      <Field label="Default capacity">
        <input type="number" min={1} max={20} value={capacity} onChange={(event) => setCapacity(event.target.value)} />
      </Field>
      <Field label="Cleaning time (minutes)" hint="Used to estimate when a room is ready after check-out">
        <input type="number" min={5} max={600} value={minutes} onChange={(event) => setMinutes(event.target.value)} />
      </Field>
    </FormDialog>
  )
}

interface RoomDialogProps {
  readonly room: Room | null
  readonly roomTypes: readonly RoomType[]
  readonly onClose: () => void
  readonly onSaved: () => void
}

export function RoomDialog({ room, roomTypes, onClose, onSaved }: RoomDialogProps) {
  const [number, setNumber] = useState(room?.number ?? '')
  const [floor, setFloor] = useState(String(room?.floor ?? 1))
  const [wing, setWing] = useState(room?.wing ?? '')
  const [position, setPosition] = useState(String(room?.position ?? 0))
  const [typeId, setTypeId] = useState(room?.room_type_id ?? roomTypes[0]?.id ?? '')
  const [capacity, setCapacity] = useState(room ? String(room.capacity) : '')
  const [accessible, setAccessible] = useState(room?.is_accessible ?? false)
  const [outOfService, setOutOfService] = useState(room?.out_of_service ?? false)
  const [notes, setNotes] = useState(room?.notes ?? '')
  const action = useAction()

  const submit = () =>
    void action.run(async () => {
      const body = {
        number: number.trim(),
        floor: toInt(floor),
        wing: wing.trim(),
        position: toInt(position || '0'),
        room_type_id: typeId,
        ...(capacity.trim() ? { capacity: toInt(capacity) } : {}),
        is_accessible: accessible,
        out_of_service: outOfService,
        notes: notes.trim(),
      }
      await (room ? apiSend(`/api/admin/rooms/${room.id}`, 'PATCH', body) : apiSend('/api/admin/rooms', 'POST', body))
      onSaved()
    })

  return (
    <FormDialog
      title={room ? `Edit room ${room.number}` : 'Add room'}
      submitLabel={room ? 'Save' : 'Add room'}
      onSubmit={submit}
      onClose={onClose}
      busy={action.busy}
      error={action.error}
      missing={unmet([
        [number.trim() !== '', 'Enter the room number'],
        [wing.trim() !== '', 'Enter the wing'],
        [typeId !== '', 'Add a room type first, then choose it here'],
      ])}
    >
      <Field label="Room number" required>
        <input value={number} onChange={(event) => setNumber(event.target.value)} data-autofocus />
      </Field>
      <Field label="Floor" hint="0 is the ground floor">
        <input type="number" min={-5} max={200} value={floor} onChange={(event) => setFloor(event.target.value)} />
      </Field>
      <Field label="Wing" required>
        <input value={wing} onChange={(event) => setWing(event.target.value)} />
      </Field>
      <Field label="Position along the corridor" hint="Rooms with close numbers here count as near each other">
        <input type="number" min={0} max={10000} value={position} onChange={(event) => setPosition(event.target.value)} />
      </Field>
      <Field label="Room type" required>
        <select value={typeId} onChange={(event) => setTypeId(event.target.value)}>
          {roomTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Capacity" hint="Leave empty to use the room type's default">
        <input type="number" min={1} max={20} value={capacity} onChange={(event) => setCapacity(event.target.value)} />
      </Field>
      <label className="checkbox-field">
        <input type="checkbox" checked={accessible} onChange={(event) => setAccessible(event.target.checked)} />
        Accessible room
      </label>
      <label className="checkbox-field">
        <input type="checkbox" checked={outOfService} onChange={(event) => setOutOfService(event.target.checked)} />
        Out of service (the allocator will not use it)
      </label>
      <Field label="Notes">
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} />
      </Field>
    </FormDialog>
  )
}

interface ImportSummary {
  readonly rows: number
  readonly created: number
  readonly updated: number
  readonly dry_run: boolean
}

const CSV_HEADER = 'Number,Floor,Wing,Position,Room Type,Capacity,Accessible,Out of service,Notes'

export function RoomImportDialog({ onClose, onImported }: { readonly onClose: () => void; readonly onImported: (summary: ImportSummary) => void }) {
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState<ImportSummary | null>(null)
  const action = useAction()

  const send = async (dryRun: boolean) =>
    (
      await apiRequest<ImportSummary>(`/api/admin/rooms/import${dryRun ? '?dry_run=true' : ''}`, {
        method: 'POST',
        rawBody: { text: csv, contentType: 'text/csv' },
      })
    ).data

  const readFile = async (file: File | undefined) => {
    if (!file) return
    setCsv(await file.text())
    setPreview(null)
  }

  const submit = () =>
    void action.run(async () => {
      if (!preview) {
        setPreview(await send(true))
        return
      }
      onImported(await send(false))
    })

  return (
    <FormDialog
      title="Import rooms from CSV"
      description={`Columns: ${CSV_HEADER}. Rooms are matched by number: existing ones are updated, new ones added. Nothing changes if any line has a problem.`}
      submitLabel={preview ? `Import ${preview.rows} rooms` : 'Check file'}
      onSubmit={submit}
      onClose={onClose}
      busy={action.busy}
      error={action.error}
      missing={unmet([[csv.trim() !== '', 'Paste the CSV or choose a file']])}
    >
      <Field label="CSV file">
        <input type="file" accept=".csv,text/csv" onChange={(event) => void readFile(event.target.files?.[0])} />
      </Field>
      <Field label="Or paste the CSV">
        <textarea
          value={csv}
          placeholder={`${CSV_HEADER}\n412,4,East,12,Executive Suite,2,no,no,`}
          onChange={(event) => {
            setCsv(event.target.value)
            setPreview(null)
          }}
          rows={6}
        />
      </Field>
      {preview && (
        <div className="settings-info" role="status">
          <span>
            Check passed: {preview.rows} rows, {preview.created} new rooms, {preview.updated} updated. Press Import to apply.
          </span>
        </div>
      )}
    </FormDialog>
  )
}
