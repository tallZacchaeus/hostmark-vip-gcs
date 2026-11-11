'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, FormDialog, unmet } from '@/components/ui/FormDialog'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import type { AppRole } from '@/lib/auth/roles'
import { apiSend } from '@/lib/client/api'
import { ROLE_LABELS } from '@/lib/client/labels'
import { useAction } from '@/lib/client/use-action'
import type { Account } from './types'

interface RoleSelectProps {
  readonly value: AppRole
  readonly roles: readonly AppRole[]
  readonly onChange: (role: AppRole) => void
}

function RoleSelect({ value, roles, onChange }: RoleSelectProps) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as AppRole)}>
      {roles.map((role) => (
        <option key={role} value={role}>
          {ROLE_LABELS[role]}
        </option>
      ))}
    </select>
  )
}

/** What the server did with a new or reset password (lib/services/password-delivery.ts). */
export interface PasswordOutcome {
  readonly temporary_password: string | null
  /** Missing from older servers: treated as "shown". */
  readonly password_delivery?: 'emailed' | 'email_failed' | 'shown'
}

interface TemporaryPasswordProps {
  readonly name: string
  readonly password: string
  /** Why the password is shown although email is on (the email failed). */
  readonly notice?: string
  readonly onClose: () => void
}

/** Shows a temporary password once, with a copy button. It is never stored or shown again. */
export function TemporaryPasswordDialog({ name, password, notice, onClose }: TemporaryPasswordProps) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Modal onClose={onClose} scrimClassName="settings-dialog-scrim" className="settings-dialog settings-dialog--wide" labelledBy="temp-password-title">
      <header>
        <h2 id="temp-password-title">Temporary password for {name}</h2>
        <p>Give it to them in person or by phone. It is shown only once; they choose their own at first sign-in.</p>
      </header>
      {notice && (
        <div className="settings-info">
          <Icon name="info" size={18} />
          <span>{notice}</span>
        </div>
      )}
      <div className="secret-box">
        <code>{password}</code>
        <Button icon={copied ? 'check' : 'copy'} onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <footer>
        <button type="button" className="settings-confirm" onClick={onClose}>
          Done
        </button>
      </footer>
    </Modal>
  )
}

interface InviteProps {
  readonly roles: readonly AppRole[]
  readonly onClose: () => void
  readonly onCreated: (account: Account, outcome: PasswordOutcome) => void
}

export function InviteUserDialog({ roles, onClose, onCreated }: InviteProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<AppRole>(roles[0] ?? 'coordinator')
  const action = useAction()
  const missing = unmet([
    [name.trim() !== '', 'Enter a name'],
    [/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()), 'Enter a valid email address'],
  ])

  const submit = () =>
    void action.run(async () => {
      const result = await apiSend<{ account: Account } & PasswordOutcome>('/api/admin/users', 'POST', {
        full_name: name.trim(),
        email: email.trim(),
        role,
        ...(phone.trim() ? { phone: phone.replace(/\s+/g, '') } : {}),
      })
      onCreated(result.account, result)
    })

  return (
    <FormDialog
      title="Invite user"
      description="Add a staff member to this event."
      submitLabel="Create account"
      onSubmit={submit}
      onClose={onClose}
      busy={action.busy}
      error={action.error}
      missing={missing}
    >
      <Field label="Name" required>
        <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" data-autofocus />
      </Field>
      <Field label="Email" required>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />
      </Field>
      <Field label="Phone" hint="International format, for example +2348012345678">
        <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
      </Field>
      <Field label="Role" required>
        <RoleSelect value={role} roles={roles} onChange={setRole} />
      </Field>
      <div className="settings-info">
        <Icon name="info" size={18} />
        <span>They get an email with a link to choose their password. If email is not set up, you see a temporary password once instead.</span>
      </div>
    </FormDialog>
  )
}

export function EditRoleDialog({ account, roles, onClose, onSaved }: { readonly account: Account; readonly roles: readonly AppRole[]; readonly onClose: () => void; readonly onSaved: () => void }) {
  const [role, setRole] = useState<AppRole>(account.role)
  const action = useAction()
  const submit = () =>
    void action.run(async () => {
      await apiSend(`/api/admin/users/${account.id}`, 'PATCH', { role })
      onSaved()
    })
  return (
    <FormDialog
      title="Edit role"
      description={`${account.full_name} · ${account.email}`}
      submitLabel="Save role"
      width="compact"
      onSubmit={submit}
      onClose={onClose}
      busy={action.busy}
      error={action.error}
      canSubmit={role !== account.role}
    >
      <Field label="Role">
        <RoleSelect value={role} roles={roles} onChange={setRole} />
      </Field>
    </FormDialog>
  )
}

export function ResetPasswordDialog({ account, onClose, onReset }: { readonly account: Account; readonly onClose: () => void; readonly onReset: (outcome: PasswordOutcome) => void }) {
  const action = useAction()
  const submit = () =>
    void action.run(async () => {
      onReset(await apiSend<PasswordOutcome>(`/api/admin/users/${account.id}/reset-password`, 'POST', {}))
    })
  return (
    <FormDialog
      title={`Reset ${account.full_name}'s password?`}
      description="They are signed out everywhere and must choose a new password at next sign-in."
      submitLabel="Reset password"
      width="compact"
      danger
      onSubmit={submit}
      onClose={onClose}
      busy={action.busy}
      error={action.error}
    />
  )
}

export function DeactivateUserDialog({ account, onClose, onDone }: { readonly account: Account; readonly onClose: () => void; readonly onDone: () => void }) {
  const [reason, setReason] = useState('')
  const action = useAction()
  const submit = () =>
    void action.run(async () => {
      await apiSend(`/api/admin/users/${account.id}`, 'PATCH', { active: false, ...(reason.trim() ? { deactivation_reason: reason.trim() } : {}) })
      onDone()
    })
  return (
    <FormDialog
      title="Deactivate this user?"
      description={`${account.full_name} will be signed out and can no longer sign in. Their history stays in Activity.`}
      submitLabel="Deactivate"
      width="compact"
      danger
      onSubmit={submit}
      onClose={onClose}
      busy={action.busy}
      error={action.error}
    >
      <Field label="Reason (optional)">
        <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
      </Field>
    </FormDialog>
  )
}
