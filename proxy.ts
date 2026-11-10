// Next.js 16 proxy (formerly middleware): CORS for /api when the frontend is hosted on another
// origin. Allowed origins come from API_ALLOWED_ORIGINS; unknown origins get no CORS headers.
// Also sends the sign-in page to the main address on Vercel (lib/api/canonical-host.ts).
import { type NextRequest, NextResponse } from 'next/server'
import { canonicalRedirectUrl } from '@/lib/api/canonical-host'
import { corsHeaders, preflightHeaders } from '@/lib/api/cors'
import { parseOrigins } from '@/lib/env'

const SIGN_IN_PAGE = '/sign-in'

function allowedOrigins(): string[] {
  try {
    return parseOrigins(process.env.API_ALLOWED_ORIGINS ?? '')
  } catch {
    // Invalid configuration is rejected at startup (instrumentation.ts); never widen CORS.
    return []
  }
}

export function proxy(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname === SIGN_IN_PAGE) {
    const target = canonicalRedirectUrl(request.url, request.headers.get('host'), process.env.BETTER_AUTH_URL, process.env.VERCEL_ENV)
    return target ? NextResponse.redirect(target, 307) : NextResponse.next()
  }

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
  matcher: ['/api/:path*', '/sign-in'],
}
