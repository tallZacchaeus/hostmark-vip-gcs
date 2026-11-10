// Route wrapper used by every API route: authentication, role check, forced password change,
// rate limiting, input validation and the response envelope. Dependencies are injected so the
// wrapper can be unit tested; lib/api/route.ts wires the real ones.
import type { Kysely } from 'kysely'
import type { z } from 'zod'
import { type AppRole, hasAnyRole } from '@/lib/auth/roles'
import type { Actor, ActorResolution } from '@/lib/auth/session'
import { type Tx, withUser } from '@/lib/db/context'
import { inSystemEvent } from '@/lib/db/system'
import type { DB } from '@/lib/db/types'
import type { Logger } from '@/lib/logger'
import { readLimitedText } from './body'
import { clientIp } from './client-ip'
import { ApiError, Errors, toApiError } from './errors'
import { type RateLimiter, createRateLimiter } from './rate-limit'
import { jsonError } from './response'

const MAX_JSON_BODY_BYTES = 1_000_000
const PER_USER_LIMIT = { windowMs: 60_000, max: 120 }
const PER_IP_LIMIT = { windowMs: 60_000, max: 600 }

export interface RouteDeps {
  resolveActor(headers: Headers): Promise<ActorResolution>
  getDb(): Kysely<DB>
  /** Origins allowed to make cookie-authenticated writes (the app itself + API_ALLOWED_ORIGINS). */
  allowedOrigins(): readonly string[]
  readonly logger: Logger
  /**
   * The signed-in person's current event (P9). When given, system work done during the request
   * (notifications, automatic follow-ups) happens in that event too, via inSystemEvent().
   */
  resolveEventId?(db: Kysely<DB>, userId: string, requested?: string): Promise<string | null>
}

/** The event the screen shows (P9): sent by the client so each browser tab keeps its own event. */
export const EVENT_HEADER = 'x-event-id'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function requestedEvent(headers: Headers): string | undefined {
  const value = headers.get(EVENT_HEADER)?.trim()
  if (!value) return undefined
  if (!UUID.test(value)) throw new ApiError(400, 'invalid_event', 'The event id is not valid')
  return value
}

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * CSRF defence: a state-changing request authenticated by cookie must come from a known origin.
 * Bearer-token requests are exempt (browsers never attach the token automatically).
 */
function assertTrustedOrigin(request: Request, allowed: () => readonly string[]): void {
  if (SAFE_METHODS.has(request.method) || request.headers.has('authorization') || !request.headers.has('cookie')) {
    return
  }
  const origin = request.headers.get('origin')
  if (!origin || !allowed().includes(origin)) {
    throw new ApiError(403, 'invalid_origin', 'This request must come from the app itself')
  }
}

export interface RouteOptions<TBody, TQuery, TParams> {
  readonly roles: readonly AppRole[]
  readonly body?: z.ZodType<TBody>
  readonly query?: z.ZodType<TQuery>
  readonly params?: z.ZodType<TParams>
  /** Lets a user who still has a temporary password call this route. */
  readonly allowPendingPasswordChange?: boolean
  readonly rateLimit?: RateLimiter
}

export interface HandlerContext<TBody, TQuery, TParams> {
  readonly request: Request
  readonly actor: Actor
  readonly body: TBody
  readonly query: TQuery
  readonly params: TParams
  readonly db: Kysely<DB>
  /** Runs `fn` in a transaction as this staff member; row-level security applies. */
  readonly asActor: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>
}

type SegmentParams = Record<string, string | string[] | undefined>
export type NextRouteHandler = (request: Request, context: { params: Promise<SegmentParams> }) => Promise<Response>

/** Reads a JSON body (≤ 1 MB, application/json only). Shared with the public route wrapper. */
export async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.startsWith('application/json')) {
    // Also blocks cross-site HTML form posts, which cannot send application/json.
    throw new ApiError(415, 'unsupported_media_type', 'Send the request body as JSON (Content-Type: application/json)')
  }
  const text = await readLimitedText(request, MAX_JSON_BODY_BYTES)
  if (text.trim() === '') {
    return {}
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new ApiError(400, 'invalid_json', 'The request body is not valid JSON')
  }
}

export function errorResponse(error: ApiError, requestId?: string): Response {
  const details = requestId ? { ...(error.details as object | undefined), requestId } : error.details
  const body = { code: error.code, message: error.message, ...(details === undefined ? {} : { details }) }
  const retryAfter = (error.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds
  const headers = error.status === 429 && retryAfter ? { 'Retry-After': String(retryAfter) } : undefined
  return jsonError(error.status, body, headers)
}

export function createRouteFactory(deps: RouteDeps) {
  const ipLimiter = createRateLimiter(PER_IP_LIMIT)

  return function defineRoute<TBody = undefined, TQuery = undefined, TParams = undefined>(
    options: RouteOptions<TBody, TQuery, TParams>,
    handler: (context: HandlerContext<TBody, TQuery, TParams>) => Promise<Response>,
  ): NextRouteHandler {
    const userLimiter = options.rateLimit ?? createRateLimiter(PER_USER_LIMIT)

    return async (request, routeContext) => {
      try {
        const ipCheck = ipLimiter.check(clientIp(request.headers))
        if (!ipCheck.allowed) {
          throw Errors.rateLimited(ipCheck.retryAfterSeconds)
        }
        assertTrustedOrigin(request, () => deps.allowedOrigins())

        const resolution = await deps.resolveActor(request.headers)
        if (resolution.status === 'anonymous') {
          throw Errors.unauthenticated()
        }
        if (resolution.status === 'inactive') {
          throw Errors.inactive()
        }
        const { actor } = resolution
        if (actor.mustChangePassword && !options.allowPendingPasswordChange) {
          throw Errors.passwordChangeRequired()
        }
        if (!hasAnyRole(actor.role, options.roles)) {
          throw Errors.forbidden()
        }
        const userCheck = userLimiter.check(actor.id)
        if (!userCheck.allowed) {
          throw Errors.rateLimited(userCheck.retryAfterSeconds)
        }

        const params = options.params ? options.params.parse(await routeContext.params) : (undefined as TParams)
        const query = options.query
          ? options.query.parse(Object.fromEntries(new URL(request.url).searchParams))
          : (undefined as TQuery)
        const body = options.body ? options.body.parse(await readJsonBody(request)) : (undefined as TBody)

        const db = deps.getDb()
        // The request's event: the one the screen names (if the person works on it) or their
        // chosen one. Their own transactions and any system work they cause both use it.
        const requested = requestedEvent(request.headers)
        const eventId = deps.resolveEventId ? await deps.resolveEventId(db, actor.id, requested) : null
        if (requested && eventId !== requested) {
          throw new ApiError(409, 'event_not_found', 'You do not work on this event. Reload the page.')
        }
        const run = () =>
          handler({
            request,
            actor,
            body,
            query,
            params,
            db,
            asActor: (fn) => withUser(db, actor.id, fn, eventId ?? undefined),
          })
        return await (eventId ? inSystemEvent(eventId, run) : run())
      } catch (error: unknown) {
        const apiError = toApiError(error)
        // Only unexpected failures are logged; 501/503 are expected answers with their own message.
        if (apiError.status === 500) {
          const requestId = crypto.randomUUID()
          deps.logger.error('API request failed', {
            requestId,
            method: request.method,
            path: new URL(request.url).pathname,
            error,
          })
          return errorResponse(apiError, requestId)
        }
        return errorResponse(apiError)
      }
    }
  }
}
