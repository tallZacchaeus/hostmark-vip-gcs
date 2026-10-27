import type { NextConfig } from 'next'

// The same headers Caddy sets on the droplet (Caddyfile), for hosts without it (Vercel).
// Caddy replaces rather than repeats them, so both can apply.
const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Microphone stays available to this site for the Co-Pilot's push-to-talk (P7).
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Self-contained server bundle for the Docker image that runs on the droplet (Vercel ignores it).
  output: 'standalone',
  // pg and better-auth use Node APIs; keep them out of the server bundle.
  serverExternalPackages: ['pg', 'better-auth', '@electric-sql/pglite'],
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
}

export default nextConfig
