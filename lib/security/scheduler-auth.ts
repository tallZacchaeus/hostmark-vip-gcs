// Checks the `Authorization: Bearer <CRON_SECRET>` header sent by the scheduler (Supabase pg_cron,
// or Vercel Cron, which sends the same header). Both sides are hashed first so the comparison is
// constant-time and does not reveal the secret's length.
import { createHash, timingSafeEqual } from 'node:crypto'

const BEARER = 'Bearer '

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

export function isAuthorizedScheduler(authorization: string | null, secret: string): boolean {
  if (!authorization?.startsWith(BEARER)) return false
  const presented = authorization.slice(BEARER.length)
  if (presented === '') return false
  return timingSafeEqual(digest(presented), digest(secret))
}
