// Client IP for rate limiting. On the droplet, Caddy replaces any X-Forwarded-For sent by the
// client with the real address, so the first entry can be trusted there; Vercel's edge does the same.

export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown'
}
