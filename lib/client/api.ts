// Browser-side client for the API's envelope ({ success, data, error, meta }). Same-origin
// requests carry the session cookie automatically; the browser adds the Origin header that the
// API's CSRF check expects on writes.

export interface PaginationMeta {
  readonly total: number
  readonly page: number
  readonly limit: number
}

export interface ApiResult<T> {
  readonly data: T
  readonly meta?: PaginationMeta
}

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  readonly body?: unknown
  /** Sent as-is with this content type instead of JSON (e.g. a CSV upload). */
  readonly rawBody?: { readonly text: string; readonly contentType: string }
  readonly signal?: AbortSignal
}

interface Envelope<T> {
  readonly success: boolean
  readonly data: T
  readonly error: { readonly code: string; readonly message: string; readonly details?: unknown } | null
  readonly meta?: PaginationMeta
}

const OFFLINE_MESSAGE = 'Could not reach the server. Check your connection and try again.'
const UNEXPECTED_MESSAGE = 'The server did not respond as expected. Try again in a moment.'

function isEnvelope(value: unknown): value is Envelope<unknown> {
  return typeof value === 'object' && value !== null && 'success' in value
}

// The event this screen shows (P9), sent with every request so a browser tab keeps working in the
// event it opened with even when another tab switches. Set by <SessionProvider>.
let screenEventId: string | null = null

export function setScreenEvent(eventId: string | null): void {
  screenEventId = eventId
}

function buildInit(options: RequestOptions): RequestInit {
  const headers = new Headers({ Accept: 'application/json' })
  if (screenEventId) headers.set('X-Event-Id', screenEventId)
  let body: string | undefined
  if (options.rawBody) {
    headers.set('Content-Type', options.rawBody.contentType)
    body = options.rawBody.text
  } else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(options.body)
  }
  return {
    method: options.method ?? (body === undefined ? 'GET' : 'POST'),
    headers,
    body,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: options.signal,
  }
}

async function readEnvelope(response: Response): Promise<Envelope<unknown>> {
  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    throw new ApiClientError(response.status, 'unexpected_response', UNEXPECTED_MESSAGE)
  }
  if (!isEnvelope(parsed)) {
    throw new ApiClientError(response.status, 'unexpected_response', UNEXPECTED_MESSAGE)
  }
  return parsed
}

/** Calls an API route and returns its data and pagination meta, or throws ApiClientError. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  let response: Response
  try {
    response = await fetch(path, buildInit(options))
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new ApiClientError(0, 'offline', OFFLINE_MESSAGE)
  }
  const envelope = await readEnvelope(response)
  if (!envelope.success || envelope.error) {
    const failure = envelope.error ?? { code: 'unknown_error', message: UNEXPECTED_MESSAGE }
    throw new ApiClientError(response.status, failure.code, failure.message, failure.details)
  }
  return envelope.meta ? { data: envelope.data as T, meta: envelope.meta } : { data: envelope.data as T }
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return (await apiRequest<T>(path, { signal })).data
}

export async function apiSend<T>(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown): Promise<T> {
  return (await apiRequest<T>(path, { method, body })).data
}

/** Builds "/api/x?a=1&b=2", leaving out empty values. */
export function withQuery(path: string, query: Readonly<Record<string, string | number | boolean | null | undefined>>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  }
  const text = params.toString()
  return text ? `${path}?${text}` : path
}

interface FieldProblem {
  readonly path?: string
  readonly message?: string
}

function firstFieldProblem(details: unknown): string | null {
  if (!Array.isArray(details)) return null
  const [first] = details as FieldProblem[]
  if (!first?.message) return null
  const field = first.path ? first.path.replace(/_/g, ' ').replace(/\./g, ' ') : ''
  return field ? `${field.charAt(0).toUpperCase()}${field.slice(1)}: ${first.message}` : first.message
}

/** A message that is safe to show to the person using the app (with the first field problem). */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    const problem = error.code === 'validation_failed' ? firstFieldProblem(error.details) : null
    return problem ?? error.message
  }
  return UNEXPECTED_MESSAGE
}
