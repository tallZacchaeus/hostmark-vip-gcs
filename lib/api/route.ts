// The route wrapper wired to the real session, database and logger. Import `defineRoute` from
// here in app/api/**/route.ts files.
import 'server-only'
import { resolveActor } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { resolveCurrentEventId } from '@/lib/db/current-event'
import { getServerEnv } from '@/lib/env'
import { logger } from '@/lib/logger'
import { createRouteFactory } from './handler'

function allowedOrigins(): readonly string[] {
  const env = getServerEnv()
  return [new URL(env.BETTER_AUTH_URL).origin, ...env.API_ALLOWED_ORIGINS]
}

export const defineRoute = createRouteFactory({ resolveActor, getDb, allowedOrigins, logger, resolveEventId: resolveCurrentEventId })
