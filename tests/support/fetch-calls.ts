// Reads back the requests a screen made through the mockApi fetch stub, so tests can assert on
// "what was sent where" without depending on call order.
import type { mockApi } from './api-mock'

type FetchMock = ReturnType<typeof mockApi>

export interface SentRequest {
  readonly url: string
  readonly method: string
  readonly body: unknown
}

function parseBody(body: BodyInit | null | undefined): unknown {
  if (body === undefined || body === null) return undefined
  const text = String(body)
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export function sentRequests(fetchMock: FetchMock): SentRequest[] {
  return fetchMock.mock.calls.map(([input, init]) => ({
    url: String(input),
    method: init?.method ?? 'GET',
    body: parseBody(init?.body),
  }))
}

/** Requests with this method whose URL starts with `path` (or matches it). */
export function requestsTo(fetchMock: FetchMock, method: string, path: string | RegExp): SentRequest[] {
  return sentRequests(fetchMock).filter(
    (request) => request.method === method && (typeof path === 'string' ? request.url.startsWith(path) : path.test(request.url)),
  )
}
