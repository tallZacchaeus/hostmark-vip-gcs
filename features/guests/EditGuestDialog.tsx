'use client'
// Coordinator-only details (FR-IN-11): VIP category, proximity priority and room-share group, plus
// name, dietary and notes. Saved with the version read, so a concurrent edit is never overwritten.
import { useState } from 'react'
import { Field, FormDialog, unmet } from '@/components/ui/FormDialog'
import { TITLES } from '@/features/intake/model'
import type { VipCategory } from '@/features/settings/types'
import { apiSend } from '@/lib/client/api'
import { useAction } from '@/lib/client/use-action'
import { type GuestProfile, PROXIMITY_LABELS } from './types'

interface EditGuestDialogProps {
  readonly guest: GuestProfile['guest']
  readonly categories: readonly VipCategory[]
  readonly onClose: () => void
  readonly onSaved: () => void
}

const toList = (text: string): string[] =>
  text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

export function EditGuestDialog({ guest, categories, onClose, onSaved }: EditGuestDialogProps) {
  const [title, setTitle] = useState(guest.title ?? '')
  const [fullName, setFullName] = useState(guest.full_name ?? '')
  const [organisation, setOrganisation] = useState(guest.organisation ?? '')
  const [categoryId, setCategoryId] = useState(guest.vip_category_id ?? '')
  const [proximity, setProximity] = useState(guest.proximity_priority)
  const [shareGroup, setShareGroup] = useState(guest.share_group ?? '')
  const [dietary, setDietary] = useState(guest.dietary.join(', '))
  const [accessibility, setAccessibility] = useState(guest.accessibility ?? '')
  const [notes, setNotes] = useState(guest.notes ?? '')
  const action = useAction()

  const save = () =>
    action.run(async () => {
      await apiSend(`/api/guests/${guest.id}`, 'PATCH', {
        version: guest.version,
        title,
        ...(fullName.trim() ? { full_name: fullName } : {}),
        organisation,
        vip_category_id: categoryId || null,
        proximity_priority: proximity,
        share_group: shareGroup,
        dietary: toList(dietary),
        accessibility,
        notes,
      })
      onSaved()
    })

  return (
    <FormDialog title="Edit guest" submitLabel="Save" onSubmit={save} onClose={onClose} busy={action.busy} error={action.error} missing={unmet([[guest.member_role !== 'principal' || fullName.trim() !== '', 'Enter the guest’s full name']])}>
      <Field label="Title">
        <input list="guest-titles" value={title} onChange={(event) => setTitle(event.target.value)} />
        <datalist id="guest-titles">
          {TITLES.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      </Field>
      <Field label="Full name" required={guest.member_role === 'principal'}>
        <input value={fullName} onChange={(event) => setFullName(event.target.value)} />
      </Field>
      <Field label="Position or organisation">
        <input value={organisation} onChange={(event) => setOrganisation(event.target.value)} />
      </Field>
      <Field label="VIP category" hint="Set by the coordination team, never by the guest.">
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">No category yet</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Proximity priority">
        <select value={proximity} onChange={(event) => setProximity(event.target.value as GuestProfile['guest']['proximity_priority'])}>
          {(Object.keys(PROXIMITY_LABELS) as (keyof typeof PROXIMITY_LABELS)[]).map((value) => (
            <option key={value} value={value}>
              {PROXIMITY_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Room-share group" hint="Guests with the same group share a room (for example, a couple).">
        <input value={shareGroup} onChange={(event) => setShareGroup(event.target.value)} maxLength={50} />
      </Field>
      <Field label="Dietary" hint="Separate with commas.">
        <input value={dietary} onChange={(event) => setDietary(event.target.value)} />
      </Field>
      <Field label="Accessibility">
        <input value={accessibility} onChange={(event) => setAccessibility(event.target.value)} />
      </Field>
      <Field label="Notes">
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={4000} />
      </Field>
    </FormDialog>
  )
}
