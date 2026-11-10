import { describe, expect, it } from 'vitest'
import { corsHeaders, preflightHeaders } from './cors'

const ALLOWED = ['https://ops.example.com']

describe('CORS', () => {
  it('reflects an allowed origin with credentials and exposes the bearer token header', () => {
    expect(corsHeaders('https://ops.example.com', ALLOWED)).toEqual({
      'Access-Control-Allow-Origin': 'https://ops.example.com',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Expose-Headers': 'set-auth-token',
      Vary: 'Origin',
    })
  })

  it('adds nothing for unknown or missing origins', () => {
    expect(corsHeaders('https://evil.example.com', ALLOWED)).toEqual({})
    expect(corsHeaders(null, ALLOWED)).toEqual({})
  })

  it('answers preflight requests for allowed origins only', () => {
    expect(preflightHeaders('https://ops.example.com', ALLOWED)).toMatchObject({
      'Access-Control-Allow-Origin': 'https://ops.example.com',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Event-Id',
      'Access-Control-Max-Age': '600',
    })
    expect(preflightHeaders('https://evil.example.com', ALLOWED)).toEqual({})
  })
})
