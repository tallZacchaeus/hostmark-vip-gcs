'use client'
// Sign-in and sign-out go through Better Auth's allowlisted endpoints (lib/auth/public-paths.ts).
import { ApiClientError, apiGet } from './api'

interface MeResponse {
  readonly home_route: string
  readonly user: { readonly must_change_password: boolean }
}

const SIGN_IN_FAILED = 'Email or password is incorrect.'

/** Signs in and returns where this person should go next. */
export async function signIn(email: string, password: string): Promise<string> {
  let response: Response
  try {
    response = await fetch('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email: email.trim(), password }),
    })
  } catch {
    throw new ApiClientError(0, 'offline', 'Could not reach the server. Check your connection and try again.')
  }
  if (response.status === 429) {
    throw new ApiClientError(429, 'rate_limited', 'Too many attempts. Wait a minute and try again.')
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { code?: string } | null
    const banned = body?.code?.toUpperCase().includes('BANNED')
    throw new ApiClientError(response.status, banned ? 'account_inactive' : 'invalid_credentials', banned ? 'This account has been deactivated.' : SIGN_IN_FAILED)
  }
  const me = await apiGet<MeResponse>('/api/me')
  return me.user.must_change_password ? '/account/password' : me.home_route
}

export async function signOut(): Promise<void> {
  try {
    await fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: '{}',
    })
  } finally {
    // A full page load drops every cached response from the signed-out session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/sign-in')
  }
}
