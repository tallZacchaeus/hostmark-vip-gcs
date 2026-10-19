// Next.js 16 proxy (formerly middleware): CORS for /api when the frontend is hosted on another
// origin. Allowed origins come from API_ALLOWED_ORIGINS; unknown origins get no CORS headers.
import { type NextRequest, NextResponse } from 'next/server'
import { corsHeaders, preflightHeaders } from '@/lib/api/cors'
import { parseOrigins } from '@/lib/env'

function allowedOrigins(): string[] {
  try {
    return parseOrigins(process.env.API_ALLOWED_ORIGINS ?? '')
  } catch {
    // Invalid configuration is rejected at startup (instrumentation.ts); never widen CORS.
    return []
  }
}

export function proxy(request: NextRequest): NextResponse {
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
  matcher: '/api/:path*',
}
