'use client'
// Opened from an emailed link (/reset-password?token=…): an invitation, an admin's reset or
// "Forgot password?". Sets the password once; afterwards the person signs in with it.
import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { ApiClientError, errorMessage } from '@/lib/client/api'
import { setPasswordWithLink } from '@/lib/client/password-links'
import { AuthFrame } from './AuthFrame'
import { PasswordChecklist } from './PasswordChecklist'
import { PasswordInput } from './PasswordInput'
import { allRulesMet, passwordRules } from './password-rules'

function Problem({ message, offerNewLink }: { readonly message: string; readonly offerNewLink: boolean }) {
  return (
    <div className="signin-error" role="alert">
      <Icon name="alert" />
      <span>
        {message}{' '}
        {offerNewLink && <Link href="/forgot-password">Get a new link</Link>}
      </span>
    </div>
  )
}

export function ResetPasswordScreen({ token }: { readonly token: string }) {
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<{ message: string; linkInvalid: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const rules = passwordRules(next, null)
  const matches = next !== '' && next === confirm
  const canSave = allRulesMet(rules) && matches && !busy

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSave) return
    setBusy(true)
    setError(null)
    try {
      await setPasswordWithLink(token, next)
      setDone(true)
    } catch (caught: unknown) {
      setError({ message: errorMessage(caught), linkInvalid: caught instanceof ApiClientError && caught.code === 'link_invalid' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthFrame>
      <form className="auth-form" onSubmit={submit} noValidate>
        <header>
          <h1>Choose your password</h1>
          <p>You will sign in with it from now on.</p>
        </header>
        {!token ? (
          <Problem message="This link is incomplete. Open it again from your email, or" offerNewLink />
        ) : done ? (
          <>
            <p className="signin-note" role="status">
              Your password is set. Sign in with your email and the new password.
            </p>
            <Link className="auth-primary" href="/sign-in">
              Sign in
            </Link>
          </>
        ) : (
          <>
            {error && <Problem message={error.message} offerNewLink={error.linkInvalid} />}
            <PasswordInput label="New password" value={next} autoComplete="new-password" onChange={setNext} describedBy="password-rules" autoFocus />
            <PasswordInput
              label="Confirm new password"
              value={confirm}
              autoComplete="new-password"
              hasError={confirm !== '' && !matches}
              onChange={setConfirm}
            />
            <PasswordChecklist rules={rules} matches={matches} />
            <button type="submit" className="auth-primary" disabled={!canSave}>
              {busy ? 'Saving…' : 'Save password'}
            </button>
          </>
        )}
      </form>
    </AuthFrame>
  )
}
