// CORS for a frontend hosted on another origin (e.g. a Figma Make export). Only origins listed
// in API_ALLOWED_ORIGINS are reflected; everything else gets no CORS headers at all.

const PREFLIGHT_MAX_AGE_SECONDS = 600

export function corsHeaders(origin: string | null, allowedOrigins: readonly string[]): Record<string, string> {
  if (!origin || !allowedOrigins.includes(origin)) {
    return {}
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    // Better Auth's bearer plugin returns the session token in this header on sign-in.
    'Access-Control-Expose-Headers': 'set-auth-token',
    Vary: 'Origin',
  }
}

export function preflightHeaders(origin: string | null, allowedOrigins: readonly string[]): Record<string, string> {
  const base = corsHeaders(origin, allowedOrigins)
  if (Object.keys(base).length === 0) {
    return {}
  }
  return {
    ...base,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Event-Id',
    'Access-Control-Max-Age': String(PREFLIGHT_MAX_AGE_SECONDS),
  }
}
