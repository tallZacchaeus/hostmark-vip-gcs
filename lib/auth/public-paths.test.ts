import { describe, expect, it } from 'vitest'
import { authPathFromUrl, isPublicAuthPath } from './public-paths'

describe('auth HTTP allowlist', () => {
  it.each(['/sign-in/email', '/sign-out', '/get-session', '/list-sessions', '/revoke-session', '/request-password-reset', '/reset-password'])(
    'exposes %s',
    (path) => {
      expect(isPublicAuthPath(path)).toBe(true)
    },
  )

  it.each([
    '/sign-up/email',
    '/admin/set-role',
    '/admin/create-user',
    '/admin/impersonate-user',
    '/update-user',
    '/change-email',
    '/delete-user',
    '/change-password',
    // The emailed link opens our /reset-password page, never Better Auth's redirecting callback.
    '/reset-password/some-token',
    '/forget-password',
  ])('blocks %s (handled by our own routes or not offered)', (path) => {
    expect(isPublicAuthPath(path)).toBe(false)
  })

  it('extracts the auth path from a request URL', () => {
    expect(authPathFromUrl('https://ops.example.com/api/auth/sign-in/email?x=1')).toBe('/sign-in/email')
    expect(authPathFromUrl('https://ops.example.com/api/other')).toBeNull()
  })
})
