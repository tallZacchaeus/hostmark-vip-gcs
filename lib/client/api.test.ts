import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, apiGet, apiRequest, apiSend, errorMessage, withQuery } from './api'

function mockFetch(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiRequest', () => {
  it('returns data and pagination meta from a successful envelope', async () => {
    mockFetch({ success: true, data: [{ id: 'a' }], error: null, meta: { total: 1, page: 1, limit: 50 } })

    const result = await apiRequest<{ id: string }[]>('/api/rooms')

    expect(result).toEqual({ data: [{ id: 'a' }], meta: { total: 1, page: 1, limit: 50 } })
  })

  it('sends JSON bodies with the right method and headers', async () => {
    const fetchMock = mockFetch({ success: true, data: { ok: true }, error: null })

    await apiSend('/api/thing', 'PATCH', { name: 'x' })

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe('/api/thing')
    expect(init.method).toBe('PATCH')
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
    expect(init.body).toBe('{"name":"x"}')
    expect(init.credentials).toBe('same-origin')
  })

  it('defaults to POST when a body is given and GET otherwise', async () => {
    const fetchMock = mockFetch({ success: true, data: null, error: null })

    await apiRequest('/api/a', { body: {} })
    await apiGet('/api/b')

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].method).toBe('POST')
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[1].method).toBe('GET')
  })

  it('sends a raw body with its own content type', async () => {
    const fetchMock = mockFetch({ success: true, data: null, error: null })

    await apiRequest('/api/import', { method: 'POST', rawBody: { text: 'a,b', contentType: 'text/csv' } })

    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1]
    expect(new Headers(init.headers).get('content-type')).toBe('text/csv')
    expect(init.body).toBe('a,b')
  })

  it('throws the API error code and message for a failed envelope', async () => {
    mockFetch({ success: false, data: null, error: { code: 'forbidden', message: 'Not allowed', details: { a: 1 } } }, 403)

    const error = await apiGet('/api/x').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiClientError)
    expect(error).toMatchObject({ status: 403, code: 'forbidden', message: 'Not allowed', details: { a: 1 } })
  })

  it('reports a non-JSON response as unexpected', async () => {
    mockFetch('<html>Bad gateway</html>', 502)

    await expect(apiGet('/api/x')).rejects.toMatchObject({ status: 502, code: 'unexpected_response' })
  })

  it('reports JSON that is not an envelope as unexpected', async () => {
    mockFetch({ hello: 'world' })

    await expect(apiGet('/api/x')).rejects.toMatchObject({ code: 'unexpected_response' })
  })

  it('reports a network failure as offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))

    await expect(apiGet('/api/x')).rejects.toMatchObject({ status: 0, code: 'offline' })
  })

  it('rethrows aborts unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new DOMException('Aborted', 'AbortError'))))

    await expect(apiGet('/api/x')).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('withQuery', () => {
  it('adds only the values that are set', () => {
    expect(withQuery('/api/x', { a: 1, b: '', c: undefined, d: null, e: false, f: 'y z' })).toBe('/api/x?a=1&e=false&f=y+z')
  })

  it('returns the path unchanged when nothing is set', () => {
    expect(withQuery('/api/x', {})).toBe('/api/x')
  })
})

describe('errorMessage', () => {
  it('names the first invalid field of a validation error', () => {
    const error = new ApiClientError(400, 'validation_failed', 'Some fields are missing or invalid', [
      { path: 'vehicle_capacity', message: 'At most 60' },
    ])
    expect(errorMessage(error)).toBe('Vehicle capacity: At most 60')
    expect(errorMessage(new ApiClientError(400, 'validation_failed', 'Some fields are missing or invalid', [{ message: 'Bad' }]))).toBe('Bad')
    expect(errorMessage(new ApiClientError(400, 'validation_failed', 'Some fields are missing or invalid', []))).toBe(
      'Some fields are missing or invalid',
    )
  })

  it('uses the API message for API errors and a generic one otherwise', () => {
    expect(errorMessage(new ApiClientError(400, 'bad', 'Pick a date'))).toBe('Pick a date')
    expect(errorMessage(new Error('internal detail'))).not.toContain('internal')
  })
})
