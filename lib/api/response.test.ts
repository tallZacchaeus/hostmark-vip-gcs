import { describe, expect, it } from 'vitest'
import { jsonError, jsonOk } from './response'

describe('API response envelope', () => {
  it('wraps data in a success envelope that is never cached', async () => {
    const response = jsonOk({ id: 'r1' })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ success: true, data: { id: 'r1' }, error: null })
  })

  it('includes pagination metadata and a custom status', async () => {
    const response = jsonOk([1, 2], { status: 201, meta: { total: 12, page: 2, limit: 2 } })
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      success: true,
      data: [1, 2],
      error: null,
      meta: { total: 12, page: 2, limit: 2 },
    })
  })

  it('wraps errors in a failure envelope', async () => {
    const response = jsonError(409, { code: 'conflict', message: 'Already exists' })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      success: false,
      data: null,
      error: { code: 'conflict', message: 'Already exists' },
    })
  })

  it('passes extra headers through', () => {
    const response = jsonError(429, { code: 'rate_limited', message: 'Slow down' }, { 'Retry-After': '30' })
    expect(response.headers.get('retry-after')).toBe('30')
  })
})
