'use client'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { apiSend, errorMessage } from '@/lib/client/api'
import { AuthFrame } from './AuthFrame'
import { PasswordChecklist } from './PasswordChecklist'
import { PasswordInput } from './PasswordInput'
import { allRulesMet, passwordRules } from './password-rules'

interface ChangePasswordScreenProps {
  readonly email: string
  readonly forced: boolean
  readonly homeRoute: string
}

export function ChangePasswordScreen({ email, forced, homeRoute }: ChangePasswordScreenProps) {
  const router = useRouter()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const rules = passwordRules(next, email)
  const matches = next !== '' && next === confirm
  const canSave = current !== '' && allRulesMet(rules) && matches && !busy

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSave) return
    setBusy(true)
    setError(null)
    try {
      await apiSend('/api/account/password', 'POST', { current_password: current, new_password: next })
      router.replace(homeRoute)
      router.refresh()
    } catch (caught: unknown) {
      setError(errorMessage(caught))
      setBusy(false)
    }
  }

  return (
    <AuthFrame>
      <form className="auth-form" onSubmit={submit} noValidate>
        <header>
          <h1>Choose a new password</h1>
          <p>
            {forced
              ? 'Your coordinator gave you a temporary password. Set your own to continue.'
              : 'Your other devices will be signed out.'}
          </p>
        </header>
        {error && (
          <div className="signin-error" role="alert">
            <Icon name="alert" />
            <span>{error}</span>
          </div>
        )}
        <PasswordInput
          label={forced ? 'Temporary password' : 'Current password'}
          value={current}
          autoComplete="current-password"
          onChange={setCurrent}
          autoFocus
        />
        <PasswordInput label="New password" value={next} autoComplete="new-password" onChange={setNext} describedBy="password-rules" />
        <PasswordInput
          label="Confirm new password"
          value={confirm}
          autoComplete="new-password"
          hasError={confirm !== '' && !matches}
          onChange={setConfirm}
        />
        <PasswordChecklist rules={rules} matches={matches} />
        <button type="submit" className="auth-primary" disabled={!canSave}>
          {busy ? 'Saving…' : 'Save and continue'}
        </button>
      </form>
    </AuthFrame>
  )
}
