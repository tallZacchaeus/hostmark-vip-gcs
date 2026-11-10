'use client'
// Staff accounts (FR-PL-01): invite with a one-time temporary password, change role, reset
// password, deactivate and reactivate. Admins manage roles below Admin; Super Admins manage all.
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Skeleton } from '@/components/ui/Status'
import { useToast } from '@/components/ui/Toast'
import { useSession, useTimeZone } from '@/components/shell/SessionContext'
import { STAFF_LINK_HOURS } from '@/lib/auth/password-policy'
import { type AppRole, canManageAccount } from '@/lib/auth/roles'
import { apiSend, errorMessage, withQuery } from '@/lib/client/api'
import { formatShortDay, initials } from '@/lib/client/format'
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '@/lib/client/labels'
import { refreshApi, useApi } from '@/lib/client/use-api'
import type { Account } from './types'
import { DeactivateUserDialog, EditRoleDialog, InviteUserDialog, type PasswordOutcome, ResetPasswordDialog, TemporaryPasswordDialog } from './UserDialogs'

const EMAIL_FAILED_NOTICE = 'The email could not be sent, so here is a temporary password instead. Check the email settings (Resend) if this keeps happening.'

type Dialog =
  | { readonly type: 'invite' }
  | { readonly type: 'edit' | 'reset' | 'deactivate'; readonly account: Account }
  | { readonly type: 'password'; readonly name: string; readonly password: string; readonly notice?: string }
  | null

const ROLE_CLASSES: Readonly<Record<AppRole, string>> = {
  super_admin: 'admin',
  programme_manager: 'admin',
  admin: 'admin',
  coordinator: 'coordinator',
  programs: 'programmes',
  driver: 'driver',
  accommodation: 'accommodation',
  housekeeping: 'housekeeping',
}

function statusOf(account: Account): 'Active' | 'Invited' | 'Deactivated' {
  if (!account.active) return 'Deactivated'
  return account.must_change_password ? 'Invited' : 'Active'
}

function RowMenu({ account, onPick }: { readonly account: Account; readonly onPick: (type: 'edit' | 'reset' | 'deactivate' | 'reactivate') => void }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return undefined
    const close = () => setOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])
  const pick = (type: 'edit' | 'reset' | 'deactivate' | 'reactivate') => {
    setOpen(false)
    onPick(type)
  }
  return (
    <div className="settings-row-actions" onClick={(event) => event.stopPropagation()}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Actions for ${account.full_name}`} onClick={() => setOpen((value) => !value)}>
        ...
      </button>
      {open && (
        <div className="settings-row-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => pick('edit')}>
            Edit role
          </button>
          <button type="button" role="menuitem" onClick={() => pick('reset')}>
            Reset password
          </button>
          {account.active ? (
            <button type="button" role="menuitem" className="is-danger" onClick={() => pick('deactivate')}>
              Deactivate
            </button>
          ) : (
            <button type="button" role="menuitem" onClick={() => pick('reactivate')}>
              Reactivate
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function UsersTab() {
  const { user } = useSession()
  const timeZone = useTimeZone()
  const toast = useToast()

  // Emailed: confirm and close. Otherwise show the temporary password once (saying why when the
  // email failed although it is set up).
  const showPasswordOutcome = (account: Account, outcome: PasswordOutcome, emailedMessage: string) => {
    if (outcome.password_delivery === 'emailed' || outcome.temporary_password === null) {
      setDialog(null)
      toast.show({ message: emailedMessage })
      return
    }
    const notice = outcome.password_delivery === 'email_failed' ? EMAIL_FAILED_NOTICE : undefined
    setDialog({ type: 'password', name: account.full_name, password: outcome.temporary_password, notice })
  }
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<AppRole | ''>('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const path = withQuery('/api/admin/users', { search: query.trim() || undefined, role: role || undefined, limit: 200 })
  const { data, error, isLoading, mutate } = useApi<Account[]>(path)
  const manageableRoles = ASSIGNABLE_ROLES.filter((candidate) => canManageAccount(user.role, candidate))

  const refresh = () => refreshApi('/api/admin/users')
  const close = () => setDialog(null)

  const pick = async (account: Account, type: 'edit' | 'reset' | 'deactivate' | 'reactivate') => {
    if (type !== 'reactivate') {
      setDialog({ type, account })
      return
    }
    try {
      await apiSend(`/api/admin/users/${account.id}`, 'PATCH', { active: true })
      toast.show({ message: `${account.full_name} was reactivated.` })
      await refresh()
    } catch (caught: unknown) {
      toast.show({ message: errorMessage(caught), tone: 'error' })
    }
  }

  const accounts = data ?? []
  return (
    <>
      <div className="settings-tools">
        <label className="settings-search">
          <Icon name="search" size={18} />
          <span className="visually-hidden">Search by name or email</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or email" />
        </label>
        <label className="settings-role-filter">
          <span className="visually-hidden">Role</span>
          <select value={role} onChange={(event) => setRole(event.target.value as AppRole | '')}>
            <option value="">All roles</option>
            {ASSIGNABLE_ROLES.map((item) => (
              <option key={item} value={item}>
                {ROLE_LABELS[item]}
              </option>
            ))}
          </select>
          <Icon name="chevron" size={15} />
        </label>
        <Button kind="primary" icon="userPlus" onClick={() => setDialog({ type: 'invite' })}>
          Invite user
        </Button>
      </div>
      {error ? <ErrorBanner className="settings-error" message={errorMessage(error)} onRetry={() => void mutate()} /> : null}
      <section className="settings-table-card" aria-label="Staff accounts">
        <div className="settings-table-head" aria-hidden="true">
          <span>Name</span>
          <span>Email</span>
          <span>Role</span>
          <span>Status</span>
          <span>Added</span>
          <span />
        </div>
        {isLoading ? (
          <div className="settings-loading">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="settings-empty">
            <b>No users match.</b>
            <span>Try a different name, email or role.</span>
          </div>
        ) : (
          <div className="settings-table-body" role="list">
            {accounts.map((account) => {
              const status = statusOf(account)
              const manageable = account.id !== user.id && canManageAccount(user.role, account.role)
              return (
                <div className="settings-user-row" key={account.id} role="listitem">
                  <div className="settings-user-name">
                    <span className={`settings-avatar role-${ROLE_CLASSES[account.role]}`} aria-hidden="true">
                      {initials(account.full_name)}
                    </span>
                    <b>{account.full_name}</b>
                  </div>
                  <span className="settings-email">{account.email}</span>
                  <span>
                    <i className={`settings-role role-${ROLE_CLASSES[account.role]}`}>{ROLE_LABELS[account.role]}</i>
                  </span>
                  <span>
                    <i className={`settings-status status-${status.toLowerCase()}`} title={account.deactivation_reason ?? undefined}>
                      {status}
                    </i>
                  </span>
                  <time dateTime={account.created_at}>{formatShortDay(account.created_at, timeZone)}</time>
                  {manageable ? <RowMenu account={account} onPick={(type) => void pick(account, type)} /> : <span />}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {dialog?.type === 'invite' && (
        <InviteUserDialog
          roles={manageableRoles}
          onClose={close}
          onCreated={(account, outcome) => {
            showPasswordOutcome(account, outcome, `Invitation emailed to ${account.email}. The link works for ${STAFF_LINK_HOURS} hours.`)
            void refresh()
          }}
        />
      )}
      {dialog?.type === 'edit' && (
        <EditRoleDialog
          account={dialog.account}
          roles={manageableRoles}
          onClose={close}
          onSaved={() => {
            close()
            toast.show({ message: `${dialog.account.full_name}'s role was changed.` })
            void refresh()
          }}
        />
      )}
      {dialog?.type === 'reset' && (
        <ResetPasswordDialog
          account={dialog.account}
          onClose={close}
          onReset={(outcome) =>
            showPasswordOutcome(dialog.account, outcome, `A link to choose a new password was emailed to ${dialog.account.email}.`)
          }
        />
      )}
      {dialog?.type === 'deactivate' && (
        <DeactivateUserDialog
          account={dialog.account}
          onClose={close}
          onDone={() => {
            close()
            toast.show({ message: `${dialog.account.full_name} was deactivated.` })
            void refresh()
          }}
        />
      )}
      {dialog?.type === 'password' && <TemporaryPasswordDialog name={dialog.name} password={dialog.password} notice={dialog.notice} onClose={close} />}
    </>
  )
}
