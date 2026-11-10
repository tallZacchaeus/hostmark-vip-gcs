'use client'
// Sign-in and sign-out go through Better Auth's allowlisted endpoints (lib/auth/public-paths.ts).
import { ApiClientError, apiGet } from './api'

interface MeResponse {
  readonly home_route: string
  readonly user: { readonly must_change_password: boolean }
}

const SIGN_IN_FAILED = 'Email or password is incorrect.'
const WRONG_ADDRESS = 'Sign-in does not work at this address. Open the site from its main link and try again.'
const SIGN_IN_UNAVAILABLE = 'Sign-in is not working right now. Try again in a moment.'

// Only a refusal of the details themselves may say so: anything else (a blocked address, a server
// fault) would send people hunting for a password that is in fact correct.
function signInFailure(status: number, code: string | undefined): ApiClientError {
  const upperCode = code?.toUpperCase()
  if (upperCode?.includes('BANNED')) {
    return new ApiClientError(status, 'account_inactive', 'This account has been deactivated.')
  }
  if (upperCode === 'INVALID_ORIGIN') {
    return new ApiClientError(status, 'wrong_address', WRONG_ADDRESS)
  }
  if (status === 400 || status === 401) {
    return new ApiClientError(status, 'invalid_credentials', SIGN_IN_FAILED)
  }
  return new ApiClientError(status, 'sign_in_unavailable', SIGN_IN_UNAVAILABLE)
}

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
    throw signInFailure(response.status, body?.code)
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
