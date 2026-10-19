import type { Kysely } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { Actor, ActorResolution } from '@/lib/auth/session'
import type { DB } from '@/lib/db/types'
import type { Logger } from '@/lib/logger'
import { ApiError } from './errors'
import { createRouteFactory } from './handler'
import { createRateLimiter } from './rate-limit'
import { jsonOk } from './response'

const coordinator: Actor = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ada@example.com',
  fullName: 'Ada',
  role: 'coordinator',
  mustChangePassword: false,
}

function setup(resolution: ActorResolution = { status: 'active', actor: coordinator }) {
  const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const defineRoute = createRouteFactory({
    resolveActor: async () => resolution,
    getDb: () => ({}) as Kysely<DB>,
    allowedOrigins: () => ['https://ops.example.com'],
    logger,
  })
  return { defineRoute, logger }
}

const noParams = { params: Promise.resolve({}) }

function jsonRequest(body: unknown, init: { headers?: Record<string, string> } = {}): Request {
  return new Request('https://ops.example.com/api/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...init.headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('defineRoute', () => {
  it('runs the handler with the actor, validated body, query and params', async () => {
    const { defineRoute } = setup()
    const route = defineRoute(
      {
        roles: ['coordinator'],
        body: z.object({ wing: z.string() }),
        query: z.object({ page: z.coerce.number() }),
        params: z.object({ id: z.string() }),
      },
      async ({ actor, body, query, params }) => jsonOk({ actor: actor.id, body, query, params }),
    )
    const request = new Request('https://ops.example.com/api/test?page=2', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wing: 'East' }),
    })

    const response = await route(request, { params: Promise.resolve({ id: 'r1' }) })
    expect(response.status).toBe(200)
    expect((await response.json()).data).toEqual({
      actor: coordinator.id,
      body: { wing: 'East' },
      query: { page: 2 },
      params: { id: 'r1' },
    })
  })

  it('returns 401 when nobody is signed in', async () => {
    const { defineRoute } = setup({ status: 'anonymous' })
    const route = defineRoute({ roles: ['coordinator'] }, async () => jsonOk(true))
    const response = await route(new Request('https://ops.example.com/api/test'), noParams)
    expect(response.status).toBe(401)
    expect((await response.json()).error.code).toBe('unauthenticated')
  })

  it('returns 403 for deactivated accounts and for the wrong role', async () => {
    const inactive = setup({ status: 'inactive' }).defineRoute({ roles: ['coordinator'] }, async () => jsonOk(true))
    expect((await inactive(new Request('https://ops.example.com/api/test'), noParams)).status).toBe(403)

    const wrongRole = setup().defineRoute({ roles: ['admin', 'super_admin'] }, async () => jsonOk(true))
    const response = await wrongRole(new Request('https://ops.example.com/api/test'), noParams)
    expect(response.status).toBe(403)
    expect((await response.json()).error.code).toBe('forbidden')
  })

  it('blocks everything except the password change until a temporary password is replaced', async () => {
    const pending = { status: 'active', actor: { ...coordinator, mustChangePassword: true } } as const
    const { defineRoute } = setup(pending)

    const normal = defineRoute({ roles: ['coordinator'] }, async () => jsonOk(true))
    const blocked = await normal(new Request('https://ops.example.com/api/test'), noParams)
    expect((await blocked.json()).error.code).toBe('password_change_required')

    const passwordRoute = defineRoute({ roles: ['coordinator'], allowPendingPasswordChange: true }, async () => jsonOk(true))
    expect((await passwordRoute(new Request('https://ops.example.com/api/test'), noParams)).status).toBe(200)
  })

  it('rejects invalid input with field details', async () => {
    const { defineRoute } = setup()
    const route = defineRoute({ roles: ['coordinator'], body: z.object({ floor: z.number() }) }, async () => jsonOk(true))
    const response = await route(jsonRequest({ floor: 'two' }), noParams)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('validation_failed')
    expect(body.error.details).toEqual([{ path: 'floor', message: expect.any(String) }])
  })

  it('rejects malformed JSON and non-JSON bodies', async () => {
    const { defineRoute } = setup()
    const route = defineRoute({ roles: ['coordinator'], body: z.object({}) }, async () => jsonOk(true))

    const malformed = await route(jsonRequest('{not json'), noParams)
    expect((await malformed.json()).error.code).toBe('invalid_json')

    const formPost = await route(
      new Request('https://ops.example.com/api/test', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: '{}',
      }),
      noParams,
    )
    expect(formPost.status).toBe(415)
  })

  it('rejects bodies over the size limit', async () => {
    const { defineRoute } = setup()
    const route = defineRoute({ roles: ['coordinator'], body: z.object({ notes: z.string() }) }, async () => jsonOk(true))
    const response = await route(jsonRequest({ notes: 'x'.repeat(1_100_000) }), noParams)
    expect(response.status).toBe(413)
  })

  it('rejects cookie-authenticated writes from unknown origins but allows bearer clients', async () => {
    const { defineRoute } = setup()
    const route = defineRoute({ roles: ['coordinator'], body: z.object({}) }, async () => jsonOk(true))
    const cookieWrite = (origin?: string) =>
      route(jsonRequest({}, { headers: { cookie: 'session=abc', ...(origin ? { origin } : {}) } }), noParams)

    expect((await cookieWrite('https://evil.example.com')).status).toBe(403)
    expect((await cookieWrite()).status).toBe(403)
    expect((await cookieWrite('https://ops.example.com')).status).toBe(200)

    const bearer = await route(
      jsonRequest({}, { headers: { authorization: 'Bearer token', origin: 'https://evil.example.com' } }),
      noParams,
    )
    expect(bearer.status).toBe(200)
  })

  it('stops reading a chunked body as soon as it is too large', async () => {
    const { defineRoute } = setup()
    const route = defineRoute({ roles: ['coordinator'], body: z.object({}) }, async () => jsonOk(true))
    const chunk = new TextEncoder().encode('x'.repeat(400_000))
    let pulled = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1
        controller.enqueue(chunk)
      },
    })
    const request = new Request('https://ops.example.com/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit)

    expect((await route(request, noParams)).status).toBe(413)
    expect(pulled).toBeLessThan(10)
  })

  it('rate limits per signed-in user', async () => {
    const { defineRoute } = setup()
    const route = defineRoute(
      { roles: ['coordinator'], rateLimit: createRateLimiter({ windowMs: 60_000, max: 1 }) },
      async () => jsonOk(true),
    )
    await route(new Request('https://ops.example.com/api/test'), noParams)
    const limited = await route(new Request('https://ops.example.com/api/test'), noParams)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('60')
  })

  it('passes known errors through and hides unexpected ones behind a request id', async () => {
    const { defineRoute, logger } = setup()
    const known = defineRoute({ roles: ['coordinator'] }, async () => {
      throw new ApiError(409, 'conflict', 'Already checked out by Tunde')
    })
    const knownResponse = await known(new Request('https://ops.example.com/api/test'), noParams)
    expect((await knownResponse.json()).error).toEqual({ code: 'conflict', message: 'Already checked out by Tunde' })

    const crash = defineRoute({ roles: ['coordinator'] }, async () => {
      throw new Error('connection string postgres://user:pw@db leaked')
    })
    const crashResponse = await crash(new Request('https://ops.example.com/api/test'), noParams)
    const body = await crashResponse.json()
    expect(crashResponse.status).toBe(500)
    expect(JSON.stringify(body)).not.toContain('postgres://')
    expect(body.error.details).toEqual({ requestId: expect.any(String) })
    expect(logger.error).toHaveBeenCalledOnce()
  })
})
