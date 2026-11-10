'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { errorMessage } from '@/lib/client/api'
import { signIn } from '@/lib/client/session-actions'
import { AuthFrame } from './AuthFrame'
import { PasswordInput } from './PasswordInput'

const REASON_MESSAGES: Readonly<Record<string, string>> = {
  inactive: 'This account has been deactivated. Ask your coordinator if you need access again.',
}

interface SignInScreenProps {
  readonly reason?: string
  /** Email is on: "Forgot password?" opens the email reset page instead of explaining whom to ask. */
  readonly emailResets?: boolean
}

export function SignInScreen({ reason, emailResets = false }: SignInScreenProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(reason ? (REASON_MESSAGES[reason] ?? null) : null)
  const [busy, setBusy] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const next = await signIn(email, password)
      router.replace(next)
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
          <h1>Welcome back</h1>
          <p>Sign in to coordinate the event.</p>
        </header>
        {error && (
          <div className="signin-error" role="alert" id="signin-error">
            <Icon name="alert" />
            <span>{error}</span>
          </div>
        )}
        <div className={`auth-field ${error ? 'has-error' : ''}`}>
          <label htmlFor="signin-email">
            <span>Email</span>
          </label>
          <div>
            <input
              id="signin-email"
              type="email"
              autoComplete="username"
              value={email}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'signin-error' : undefined}
              onChange={(changeEvent) => {
                setEmail(changeEvent.target.value)
                setError(null)
              }}
              autoFocus
            />
          </div>
        </div>
        <PasswordInput
          label="Password"
          value={password}
          autoComplete="current-password"
          hasError={Boolean(error)}
          describedBy={error ? 'signin-error' : undefined}
          onChange={(value) => {
            setPassword(value)
            setError(null)
          }}
        />
        <button type="submit" className="auth-primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {emailResets ? (
          <Link className="forgot-password" href="/forgot-password">
            Forgot password?
          </Link>
        ) : (
          <button type="button" className="forgot-password" onClick={() => setShowHelp(true)}>
            Forgot password?
          </button>
        )}
        {showHelp && (
          <p className="signin-note" role="status">
            Ask your coordinator or an admin to reset your password. You will get a temporary one to change at sign-in.
          </p>
        )}
        <div className="signin-divider" />
        <p className="signin-invitation">Access is by invitation from your coordinator.</p>
      </form>
    </AuthFrame>
  )
}
