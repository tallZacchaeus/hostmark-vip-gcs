// The single response envelope used by every API route.

export interface ApiErrorBody {
  readonly code: string
  readonly message: string
  readonly details?: unknown
}

export interface PaginationMeta {
  readonly total: number
  readonly page: number
  readonly limit: number
}

export type ApiEnvelope<T> =
  | { readonly success: true; readonly data: T; readonly error: null; readonly meta?: PaginationMeta }
  | { readonly success: false; readonly data: null; readonly error: ApiErrorBody }

export interface JsonOkOptions {
  readonly status?: number
  readonly meta?: PaginationMeta
  readonly headers?: HeadersInit
}

function buildHeaders(extra?: HeadersInit): Headers {
  // API responses carry personal and operational data: never cache them.
  const headers = new Headers({ 'Cache-Control': 'no-store' })
  new Headers(extra).forEach((value, key) => headers.set(key, value))
  return headers
}

export function jsonOk<T>(data: T, options: JsonOkOptions = {}): Response {
  const body: ApiEnvelope<T> = options.meta
    ? { success: true, data, error: null, meta: options.meta }
    : { success: true, data, error: null }
  return Response.json(body, { status: options.status ?? 200, headers: buildHeaders(options.headers) })
}

export function jsonError(status: number, error: ApiErrorBody, headers?: HeadersInit): Response {
  const body: ApiEnvelope<never> = { success: false, data: null, error }
  return Response.json(body, { status, headers: buildHeaders(headers) })
}
