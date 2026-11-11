'use client'
// Copying setup into a draft event (P9 step 9.4): choose an earlier event and what to bring over.
// Guests, flights and everything that happened stay with the earlier event.
import { useState } from 'react'
import { Field, FormDialog, unmet } from '@/components/ui/FormDialog'
import { apiSend } from '@/lib/client/api'
import { plural } from '@/lib/client/format'
import { useAction } from '@/lib/client/use-action'
import { COPY_PARTS, type CopyCounts, type CopyPart, type ManagedEvent } from './types'

const PART_LABELS: Readonly<Record<CopyPart, { label: string; hint: string }>> = {
  settings: { label: 'Settings', hint: 'Airports, travel times, buffers and the desk phone' },
  rooms: { label: 'Rooms', hint: 'Room types and rooms, all in service and clean' },
  categories: { label: 'VIP categories', hint: 'Names, ranks and preferred room tiers' },
  drivers: { label: 'Drivers', hint: 'Active drivers and vehicles, without shifts' },
  staff: { label: 'Staff', hint: 'The same team works on this event' },
}

const COUNT_LABELS: ReadonlyArray<[keyof CopyCounts, string]> = [
  ['room_types', 'room type'],
  ['rooms', 'room'],
  ['categories', 'VIP category'],
  ['drivers', 'driver'],
  ['staff', 'staff member'],
]

/** "Copied 2 room types, 40 rooms." */
export function describeCopy(counts: CopyCounts): string {
  const parts = COUNT_LABELS.filter(([key]) => counts[key] !== undefined).map(([key, label]) =>
    plural(counts[key] ?? 0, label, label === 'VIP category' ? 'VIP categories' : undefined),
  )
  return parts.length ? `Copied ${parts.join(', ')}.` : 'Settings copied.'
}

interface CopySetupDialogProps {
  readonly target: ManagedEvent
  readonly sources: readonly ManagedEvent[]
  readonly onCopied: (message: string) => void
  readonly onClose: () => void
}

export function CopySetupDialog({ target, sources, onCopied, onClose }: CopySetupDialogProps) {
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '')
  const [parts, setParts] = useState<readonly CopyPart[]>(COPY_PARTS)
  const action = useAction()

  const togglePart = (part: CopyPart) =>
    setParts((current) => (current.includes(part) ? current.filter((value) => value !== part) : COPY_PARTS.filter((value) => value === part || current.includes(value))))

  const submit = () =>
    void action.run(async () => {
      const counts = await apiSend<CopyCounts>(`/api/events/${target.id}/copy`, 'POST', { from_event_id: sourceId, parts })
      onCopied(describeCopy(counts))
    })

  return (
    <FormDialog
      title={`Copy setup into ${target.name}`}
      description="Bring over what stays the same from an earlier event. Guests, flights and history are never copied."
      submitLabel="Copy"
      onSubmit={submit}
      onClose={onClose}
      busy={action.busy}
      error={action.error}
      missing={unmet([
        [sourceId !== '', 'Choose the event to copy from'],
        [parts.length > 0, 'Tick at least one thing to copy'],
      ])}
    >
      {sources.length === 0 ? (
        <p className="field-note is-wide">There is no other event to copy from yet.</p>
      ) : (
        <Field label="Copy from" required className="is-wide">
          <select value={sourceId} onChange={(changeEvent) => setSourceId(changeEvent.target.value)}>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <fieldset className="copy-parts is-wide">
        <legend>What to copy</legend>
        {COPY_PARTS.map((part) => (
          <label key={part} className="checkbox-field">
            <input type="checkbox" checked={parts.includes(part)} onChange={() => togglePart(part)} />
            <span>
              <b>{PART_LABELS[part].label}</b>
              <small>{PART_LABELS[part].hint}</small>
            </span>
          </label>
        ))}
      </fieldset>
    </FormDialog>
  )
}
