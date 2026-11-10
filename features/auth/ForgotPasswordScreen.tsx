'use client'
// "Forgot password?" (shown only while email is on): emails a one-hour link. The answer is the
// same whether or not the address has an account, so the page cannot be used to find accounts.
import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { errorMessage } from '@/lib/client/api'
import { requestPasswordLink } from '@/lib/client/password-links'
import { AuthFrame } from './AuthFrame'

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const address = email.trim()
    if (!address) {
      setError('Enter your email.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await requestPasswordLink(address)
      setSentTo(address)
    } catch (caught: unknown) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthFrame>
      <form className="auth-form" onSubmit={submit} noValidate>
        <header>
          <h1>Forgot your password?</h1>
          <p>We will email you a link to choose a new one.</p>
        </header>
        {error && (
          <div className="signin-error" role="alert" id="forgot-error">
            <Icon name="alert" />
            <span>{error}</span>
          </div>
        )}
        {sentTo ? (
          <p className="signin-note" role="status">
            If an account uses {sentTo}, a link to choose a new password is on its way. It works for 1 hour; check your spam folder if it has not arrived in a few minutes.
          </p>
        ) : (
          <>
            <div className={`auth-field ${error ? 'has-error' : ''}`}>
              <label htmlFor="forgot-email">
                <span>Email</span>
              </label>
              <div>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'forgot-error' : undefined}
                  onChange={(changeEvent) => {
                    setEmail(changeEvent.target.value)
                    setError(null)
                  }}
                  autoFocus
                />
              </div>
            </div>
            <button type="submit" className="auth-primary" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a link'}
            </button>
          </>
        )}
        <Link className="forgot-password" href="/sign-in">
          Back to sign in
        </Link>
      </form>
    </AuthFrame>
  )
}
