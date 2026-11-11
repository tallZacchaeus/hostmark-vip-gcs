'use client'
// Add or edit a programme item (FR-PG-01/02): title, kind, day and times in the event time zone,
// venue, description, status (draft → published, or cancelled) and the VIP participants with their
// roles. Saving writes the item, then its participants; the server recomputes the at-risk flag. An item
// left outside the event days keeps its day as an option until it is moved onto an event day.
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, FormDialog, unmet } from '@/components/ui/FormDialog'
import { Icon } from '@/components/ui/Icon'
import { apiSend } from '@/lib/client/api'
import { dateKey, formatShortDay, formatTime, zonedDateTime } from '@/lib/client/format'
import { useAction } from '@/lib/client/use-action'
import { refreshApi, useApi } from '@/lib/client/use-api'
import type { ProgrammeGuest, ProgramItemView, ProgramParticipant } from '@/lib/repositories/programme'
import { PROGRAM_KINDS, PROGRAM_ROLES, PROGRAM_STATUSES } from '@/lib/validation/programme'
import { KIND_LABELS, PROGRAMME_PATH, ROLE_LABELS, STATUS_LABELS } from './model'

type Role = ProgramParticipant['role']
interface Draft {
  readonly title: string
  readonly kind: ProgramItemView['kind']
  readonly day: string
  readonly start: string
  readonly end: string
  readonly location: string
  readonly description: string
  readonly status: ProgramItemView['status']
  readonly participants: readonly { readonly guest_id: string; readonly role: Role }[]
}

function initialDraft(item: ProgramItemView | null, day: string, timeZone: string): Draft {
  if (!item) return { title: '', kind: 'session', day, start: '09:00', end: '10:00', location: '', description: '', status: 'draft', participants: [] }
  return {
    title: item.title,
    kind: item.kind,
    day: dateKey(item.starts_at, timeZone),
    start: formatTime(item.starts_at, timeZone),
    end: formatTime(item.ends_at, timeZone),
    location: item.location,
    description: item.description ?? '',
    status: item.status,
    participants: item.participants.map((participant) => ({ guest_id: participant.guest_id, role: participant.role })),
  }
}

interface ItemDialogProps {
  readonly item: ProgramItemView | null
  readonly day: string
  readonly days: readonly string[]
  readonly venues: readonly string[]
  readonly timeZone: string
  readonly onClose: () => void
  readonly onSaved: (message: string) => void
}

function Participants({ draft, guests, onChange }: { readonly draft: Draft; readonly guests: readonly ProgrammeGuest[]; readonly onChange: (next: Draft['participants']) => void }) {
  const [adding, setAdding] = useState('')
  const [role, setRole] = useState<Role>('speaker')
  const byId = new Map(guests.map((guest) => [guest.id, guest]))
  const available = guests.filter((guest) => !draft.participants.some((participant) => participant.guest_id === guest.id))
  return (
    <fieldset className="programme-participants">
      <legend>VIP participants</legend>
      {draft.participants.length === 0 ? <p className="field-hint">Nobody yet. Participants make the arrival check possible.</p> : null}
      <ul>
        {draft.participants.map((participant) => (
          <li key={participant.guest_id}>
            <span>
              <b>{byId.get(participant.guest_id)?.name ?? 'Guest'}</b>
              <small>{byId.get(participant.guest_id)?.category ?? byId.get(participant.guest_id)?.delegation ?? ''}</small>
            </span>
            <select
              aria-label={`Role of ${byId.get(participant.guest_id)?.name ?? 'guest'}`}
              value={participant.role}
              onChange={(event) => onChange(draft.participants.map((item) => (item.guest_id === participant.guest_id ? { ...item, role: event.target.value as Role } : item)))}
            >
              {PROGRAM_ROLES.map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABELS[value]}
                </option>
              ))}
            </select>
            <button type="button" className="icon-button is-danger" aria-label={`Remove ${byId.get(participant.guest_id)?.name ?? 'guest'}`} onClick={() => onChange(draft.participants.filter((item) => item.guest_id !== participant.guest_id))}>
              <Icon name="trash" size={16} />
            </button>
          </li>
        ))}
      </ul>
      <div className="programme-participant-add">
        <select aria-label="Guest to add" value={adding} onChange={(event) => setAdding(event.target.value)}>
          <option value="">Choose a guest…</option>
          {available.map((guest) => (
            <option key={guest.id} value={guest.id}>
              {guest.name}
              {guest.category ? ` · ${guest.category}` : ''}
            </option>
          ))}
        </select>
        <select aria-label="Role for the new participant" value={role} onChange={(event) => setRole(event.target.value as Role)}>
          {PROGRAM_ROLES.map((value) => (
            <option key={value} value={value}>
              {ROLE_LABELS[value]}
            </option>
          ))}
        </select>
        <Button
          icon="plus"
          disabled={!adding}
          onClick={() => {
            onChange([...draft.participants, { guest_id: adding, role }])
            setAdding('')
          }}
        >
          Add
        </Button>
      </div>
    </fieldset>
  )
}

export function ItemDialog({ item, day, days, venues, timeZone, onClose, onSaved }: ItemDialogProps) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(item, day, timeZone))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const guests = useApi<ProgrammeGuest[]>('/api/programme/guests')
  const action = useAction()
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const ownDay = item ? dateKey(item.starts_at, timeZone) : null
  const strandedDay = ownDay && !days.includes(ownDay) ? ownDay : null
  const missing = unmet([
    [draft.title.trim() !== '', 'Enter a title'],
    [draft.location.trim() !== '', 'Enter a venue'],
    [draft.end > draft.start, 'Make the end time later than the start time'],
  ])

  const save = () =>
    void action
      .run(async () => {
        const body = {
          title: draft.title,
          kind: draft.kind,
          starts_at: zonedDateTime(draft.day, draft.start, timeZone),
          ends_at: zonedDateTime(draft.day, draft.end, timeZone),
          location: draft.location,
          description: draft.description,
          status: draft.status,
        }
        const saved = item ? await apiSend<{ id: string }>(`/api/program-items/${item.id}`, 'PATCH', body) : await apiSend<{ id: string }>('/api/program-items', 'POST', body)
        await apiSend(`/api/program-items/${saved.id}/participants`, 'PUT', { participants: draft.participants })
        await refreshApi(PROGRAMME_PATH)
      })
      .then((ok) => ok && onSaved(item ? 'Programme item saved.' : 'Programme item added.'))

  const remove = () =>
    void action
      .run(async () => {
        if (!item) return
        await apiSend(`/api/program-items/${item.id}`, 'DELETE')
        await refreshApi(PROGRAMME_PATH)
      })
      .then((ok) => ok && onSaved('Programme item deleted.'))

  return (
    <FormDialog
      title={item ? 'Edit programme item' : 'Add programme item'}
      description={`Times are in the event time zone (${timeZone}). Published items are visible to coordinators.`}
      submitLabel={item ? 'Save' : 'Add item'}
      onSubmit={save}
      onClose={onClose}
      busy={action.busy}
      error={action.error}
      missing={missing}
    >
      <Field label="Title" required>
        <input value={draft.title} maxLength={200} onChange={(event) => set('title', event.target.value)} />
      </Field>
      <Field label="Type">
        <select value={draft.kind} onChange={(event) => set('kind', event.target.value as Draft['kind'])}>
          {PROGRAM_KINDS.map((value) => (
            <option key={value} value={value}>
              {KIND_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Day">
        <select value={draft.day} onChange={(event) => set('day', event.target.value)}>
          {days.map((value) => (
            <option key={value} value={value}>
              {formatShortDay(`${value}T12:00:00Z`, 'UTC')}
            </option>
          ))}
          {strandedDay ? <option value={strandedDay}>{formatShortDay(`${strandedDay}T12:00:00Z`, 'UTC')} (outside the event days)</option> : null}
        </select>
      </Field>
      <Field label="Starts">
        <input type="time" value={draft.start} onChange={(event) => set('start', event.target.value)} />
      </Field>
      <Field label="Ends" hint={draft.end > draft.start ? undefined : 'The end must be after the start.'}>
        <input type="time" value={draft.end} onChange={(event) => set('end', event.target.value)} />
      </Field>
      <Field label="Venue" required>
        <input value={draft.location} maxLength={120} list="programme-venues" onChange={(event) => set('location', event.target.value)} />
        <datalist id="programme-venues">
          {venues.map((venue) => (
            <option key={venue} value={venue} />
          ))}
        </datalist>
      </Field>
      <Field label="Description">
        <textarea value={draft.description} maxLength={2000} rows={3} onChange={(event) => set('description', event.target.value)} />
      </Field>
      <Field label="Status">
        <select value={draft.status} onChange={(event) => set('status', event.target.value as Draft['status'])}>
          {PROGRAM_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>
      <Participants draft={draft} guests={guests.data ?? []} onChange={(next) => set('participants', next)} />
      {item ? (
        <div className="programme-delete">
          {confirmDelete ? (
            <Button kind="ghost" icon="trash" busy={action.busy} onClick={remove}>
              Delete permanently
            </Button>
          ) : (
            <Button kind="ghost" icon="trash" onClick={() => setConfirmDelete(true)}>
              Delete item
            </Button>
          )}
        </div>
      ) : null}
    </FormDialog>
  )
}
