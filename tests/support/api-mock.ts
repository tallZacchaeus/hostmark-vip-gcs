// A fetch stub for screen tests: answers API paths with the response envelope, the way the real
// routes do. Routes match by path prefix (or a pattern) and HTTP method; the first match wins.
import { vi } from 'vitest'

export interface MockRoute {
  readonly path: string | RegExp
  readonly method?: string
  /** The `data` of a success, or the `error` of a failure when status >= 400. */
  readonly body: unknown
  readonly status?: number
  readonly meta?: unknown
}

export function mockApi(routes: readonly MockRoute[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const route = routes.find(
      (candidate) =>
        (candidate.method ?? 'GET') === method && (typeof candidate.path === 'string' ? url.startsWith(candidate.path) : candidate.path.test(url)),
    )
    if (!route) {
      return Response.json({ success: false, data: null, error: { code: 'not_found', message: `No mock for ${method} ${url}` } }, { status: 404 })
    }
    const status = route.status ?? 200
    const envelope =
      status >= 400
        ? { success: false, data: null, error: route.body }
        : { success: true, data: route.body, error: null, ...(route.meta ? { meta: route.meta } : {}) }
    return Response.json(envelope, { status })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** The JSON body a mocked call was made with. */
export function sentBody(fetchMock: ReturnType<typeof mockApi>, index: number): unknown {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined
  return init?.body ? JSON.parse(String(init.body)) : undefined
}
