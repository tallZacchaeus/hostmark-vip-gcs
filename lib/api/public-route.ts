// Route wrapper for the few endpoints that need no sign-in (the public registration link). Same
// envelope, body limits and error mapping as lib/api/handler.ts, plus a stricter per-IP limit;
// anything that writes must still apply its own checks (bot check, per-IP limit in Postgres).
import type { z } from 'zod'
import { logger } from '@/lib/logger'
import { clientIp } from './client-ip'
import { Errors, toApiError } from './errors'
import { type NextRouteHandler, errorResponse, readJsonBody } from './handler'
import { type RateLimiter, createRateLimiter } from './rate-limit'

const PUBLIC_IP_LIMIT = { windowMs: 60_000, max: 30 }

export interface PublicContext<TBody, TParams> {
  readonly request: Request
  readonly ip: string
  readonly body: TBody
  readonly params: TParams
}

export interface PublicRouteOptions<TBody, TParams> {
  readonly body?: z.ZodType<TBody>
  readonly params?: z.ZodType<TParams>
  readonly rateLimit?: RateLimiter
}

export function definePublicRoute<TBody = undefined, TParams = undefined>(
  options: PublicRouteOptions<TBody, TParams>,
  handler: (context: PublicContext<TBody, TParams>) => Promise<Response>,
): NextRouteHandler {
  const limiter = options.rateLimit ?? createRateLimiter(PUBLIC_IP_LIMIT)
  return async (request, routeContext) => {
    try {
      const ip = clientIp(request.headers)
      const check = limiter.check(ip)
      if (!check.allowed) throw Errors.rateLimited(check.retryAfterSeconds)
      const params = options.params ? options.params.parse(await routeContext.params) : (undefined as TParams)
      const body = options.body ? options.body.parse(await readJsonBody(request)) : (undefined as TBody)
      return await handler({ request, ip, body, params })
    } catch (error: unknown) {
      const apiError = toApiError(error)
      if (apiError.status === 500) {
        const requestId = crypto.randomUUID()
        logger.error('Public request failed', { requestId, method: request.method, path: new URL(request.url).pathname, error })
        return errorResponse(apiError, requestId)
      }
      return errorResponse(apiError)
    }
  }
}
