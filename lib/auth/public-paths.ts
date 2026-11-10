// Better Auth endpoints reachable over HTTP. Everything else (sign-up, the admin plugin's
// endpoints, profile and password changes) is blocked here and offered only through our own
// routes, which enforce rules Better Auth does not know about (e.g. an Admin may not manage
// Admin or Super Admin accounts; a password change clears must_change_password).

const AUTH_PREFIX = '/api/auth'

const PUBLIC_AUTH_PATHS: ReadonlySet<string> = new Set([
  '/sign-in/email',
  '/sign-out',
  '/get-session',
  '/list-sessions',
  '/revoke-session',
  '/revoke-other-sessions',
  // Emailed password links (lib/auth/password-links.ts): ask for one, then set the password with
  // its token. Both answer the same for unknown addresses; requests are rate limited in auth.ts.
  '/request-password-reset',
  '/reset-password',
  '/ok',
  '/error',
])

export function isPublicAuthPath(path: string): boolean {
  return PUBLIC_AUTH_PATHS.has(path)
}

/** "/api/auth/sign-in/email?x" → "/sign-in/email"; null for non-auth URLs. */
export function authPathFromUrl(url: string): string | null {
  const { pathname } = new URL(url)
  if (!pathname.startsWith(`${AUTH_PREFIX}/`)) {
    return null
  }
  return pathname.slice(AUTH_PREFIX.length)
}
