'use client'
// Choosing who works on an event (P9 step 9.4): every staff account below Programme Manager, ticked
// when it is on the team. Each tick saves at once; the person then sees the event in their switcher.
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/Feedback'
import { Skeleton } from '@/components/ui/Status'
import { apiSend, errorMessage } from '@/lib/client/api'
import { ROLE_LABELS } from '@/lib/client/labels'
import { useAction } from '@/lib/client/use-action'
import { useApi } from '@/lib/client/use-api'
import type { AppRole } from '@/lib/auth/roles'
import type { ManagedEvent, StaffOption } from './types'

interface TeamDialogProps {
  readonly event: ManagedEvent
  readonly onChanged: () => void
  readonly onClose: () => void
}

export function TeamDialog({ event, onChanged, onClose }: TeamDialogProps) {
  const path = `/api/events/${event.id}/staff`
  const { data, error, isLoading, mutate } = useApi<StaffOption[]>(path)
  const action = useAction()

  const toggle = (person: StaffOption) =>
    void action.run(async () => {
      await apiSend(path, 'PUT', { profile_id: person.id, member: !person.is_member })
      await mutate()
      onChanged()
    })

  const members = data?.filter((person) => person.is_member).length ?? 0
  return (
    <Modal onClose={onClose} scrimClassName="settings-dialog-scrim" className="settings-dialog settings-dialog--wide" role="dialog" labelledBy="team-title">
      <header>
        <h2 id="team-title">Team for {event.name}</h2>
        <p>Ticked people work on this event and can switch to it. Create new accounts in Settings → Users.</p>
      </header>
      <div className="settings-dialog-fields team-list">
        {isLoading && <Skeleton className="sk-wide" />}
        {error ? <ErrorBanner message={errorMessage(error)} onRetry={() => void mutate()} /> : null}
        {data?.length === 0 && <p className="field-note">There are no staff accounts yet. Create them in Settings → Users.</p>}
        {data?.map((person) => (
          <label key={person.id} className="checkbox-field team-row">
            <input type="checkbox" checked={person.is_member} disabled={action.busy} onChange={() => toggle(person)} />
            <span>
              <b>{person.full_name}</b>
              <small>
                {ROLE_LABELS[person.role as AppRole] ?? person.role} · {person.email}
              </small>
            </span>
          </label>
        ))}
        {action.error && (
          <p className="form-error" role="alert">
            {action.error}
          </p>
        )}
      </div>
      <footer className="team-footer">
        <span className="field-note">{members} on the team</span>
        <Button kind="primary" onClick={onClose}>
          Done
        </Button>
      </footer>
    </Modal>
  )
}
