// Server-side gate for pages (Server Components and layouts). It mirrors the API route wrapper:
// signed in → active → temporary password changed → role allowed, redirecting instead of
// answering with an error. The data on each page is still protected by the API and RLS.
import 'server-only'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import type { SessionValue } from '@/components/shell/SessionContext'
import { getDb } from '@/lib/db/client'
import { withUser } from '@/lib/db/context'
import { type EventContext, findEventContext, listMyEvents, type MyEvent } from '@/lib/repositories/event'
import { getAuth } from './auth'
import { type AppRole, HOME_ROUTES, hasAnyRole } from './roles'
import { type Actor, type ActorResolution, toActorResolution } from './session'

export interface PageSession {
  readonly actor: Actor
  readonly event: EventContext | null
  /** The events this person works on (P9), for the event switcher. */
  readonly events: readonly MyEvent[]
  readonly homeRoute: string
}

export interface PageGuardOptions {
  /** The change-password screen itself must stay reachable with a temporary password. */
  readonly allowPendingPasswordChange?: boolean
}

/** The signed-in staff member for this request (looked up once per request, then cached). */
export const readPageActor = cache(async (): Promise<ActorResolution> => {
  // headers() first: it marks the page as dynamic before anything reads the configuration.
  const requestHeaders = await headers()
  const session = await getAuth().api.getSession({ headers: requestHeaders })
  return toActorResolution(session?.user)
})

const readEventContext = cache(async (userId: string): Promise<{ event: EventContext | null; events: MyEvent[] }> =>
  withUser(getDb(), userId, async (tx) => ({ event: await findEventContext(tx), events: await listMyEvents(tx) })),
)

/** Where to send someone who may not see the page they asked for. */
export function redirectTargetFor(
  resolution: ActorResolution,
  allowed: readonly AppRole[],
  options: PageGuardOptions = {},
): string | null {
  if (resolution.status === 'anonymous') return '/sign-in'
  if (resolution.status === 'inactive') return '/sign-in?reason=inactive'
  const { actor } = resolution
  if (actor.mustChangePassword && !options.allowPendingPasswordChange) return '/account/password'
  if (!hasAnyRole(actor.role, allowed)) return `/forbidden?home=${encodeURIComponent(HOME_ROUTES[actor.role])}`
  return null
}

export async function requirePageSession(
  allowed: readonly AppRole[],
  options: PageGuardOptions = {},
): Promise<PageSession> {
  const resolution = await readPageActor()
  const target = redirectTargetFor(resolution, allowed, options)
  if (target || resolution.status !== 'active') {
    redirect(target ?? '/sign-in')
  }
  const { actor } = resolution
  const { event, events } = await readEventContext(actor.id)
  return { actor, event, events, homeRoute: HOME_ROUTES[actor.role] }
}

/** The serialisable part of a page session that client components receive. */
export function toSessionValue(session: PageSession): SessionValue {
  const { actor } = session
  return {
    user: { id: actor.id, fullName: actor.fullName, email: actor.email, role: actor.role },
    event: session.event,
    events: session.events.map(({ id, name, status, is_current }) => ({ id, name, status, is_current })),
    homeRoute: session.homeRoute,
  }
}
