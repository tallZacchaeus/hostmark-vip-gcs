// Next.js 16 proxy (formerly middleware): CORS for /api when the frontend is hosted on another
// origin. Allowed origins come from API_ALLOWED_ORIGINS; unknown origins get no CORS headers.
// Also sends the sign-in page to the main address on Vercel (lib/api/canonical-host.ts), and gives
// every page a Content-Security-Policy with a per-request nonce (lib/api/csp.ts).
import { type NextRequest, NextResponse } from 'next/server'
import { canonicalRedirectUrl } from '@/lib/api/canonical-host'
import { corsHeaders, preflightHeaders } from '@/lib/api/cors'
import { contentSecurityPolicy, newNonce } from '@/lib/api/csp'
import { parseOrigins } from '@/lib/env'

const SIGN_IN_PAGE = '/sign-in'
const CSP_HEADER = 'Content-Security-Policy'

/** Pages: the policy goes on the request too, which is where Next.js reads the nonce from. */
function pageWithPolicy(request: NextRequest): NextResponse {
  const policy = contentSecurityPolicy(newNonce(), { development: process.env.NODE_ENV === 'development' })
  const headers = new Headers(request.headers)
  headers.set(CSP_HEADER, policy)
  const response = NextResponse.next({ request: { headers } })
  response.headers.set(CSP_HEADER, policy)
  return response
}

function allowedOrigins(): string[] {
  try {
    return parseOrigins(process.env.API_ALLOWED_ORIGINS ?? '')
  } catch {
    // Invalid configuration is rejected at startup (instrumentation.ts); never widen CORS.
    return []
  }
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl
  if (pathname === SIGN_IN_PAGE) {
    const target = canonicalRedirectUrl(request.url, request.headers.get('host'), process.env.BETTER_AUTH_URL, process.env.VERCEL_ENV)
    if (target) return NextResponse.redirect(target, 307)
  }
  if (!pathname.startsWith('/api/')) return pageWithPolicy(request)

  const origin = request.headers.get('origin')
  const allowed = allowedOrigins()

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: preflightHeaders(origin, allowed) })
  }

  const response = NextResponse.next()
  for (const [name, value] of Object.entries(corsHeaders(origin, allowed))) {
    response.headers.set(name, value)
  }
  return response
}

export const config = {
  // Everything except built files and static assets (pages get the CSP; /api gets CORS).
  matcher: ['/((?!_next/static|_next/image|images/|.*\\.(?:svg|png|jpe?g|webp|ico|woff2?)$).*)'],
}
