import { describe, expect, it } from 'vitest'
import { parseOrigins, parseServerEnv } from './env'

const VALID = {
  DATABASE_URL: 'postgres://vip_app:secret@127.0.0.1:5433/vip_gcs',
  SERVICE_DATABASE_URL: 'postgres://vip_service:secret@127.0.0.1:5433/vip_gcs',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  API_ALLOWED_ORIGINS: 'https://ops.example.com, https://staff.example.com',
  NODE_ENV: 'production',
}

describe('server environment', () => {
  it('parses a complete configuration', () => {
    const env = parseServerEnv(VALID)
    expect(env.API_ALLOWED_ORIGINS).toEqual(['https://ops.example.com', 'https://staff.example.com'])
    expect(env.NODE_ENV).toBe('production')
  })

  it('names missing or weak settings without echoing their values', () => {
    expect(() => parseServerEnv({ ...VALID, BETTER_AUTH_SECRET: 'short-secret-value' })).toThrow(/BETTER_AUTH_SECRET/)
    expect(() => parseServerEnv({ ...VALID, BETTER_AUTH_SECRET: 'short-secret-value' })).not.toThrow(/short-secret-value/)
    expect(() => parseServerEnv({ ...VALID, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/)
  })

  it('rejects a database URL that is not Postgres', () => {
    expect(() => parseServerEnv({ ...VALID, DATABASE_URL: 'mysql://db/app' })).toThrow(/DATABASE_URL/)
  })

  it('defaults to no extra origins', () => {
    expect(parseServerEnv({ ...VALID, API_ALLOWED_ORIGINS: undefined }).API_ALLOWED_ORIGINS).toEqual([])
  })
})

describe('parseOrigins', () => {
  it('keeps exact origins and drops blanks', () => {
    expect(parseOrigins(' https://a.example.com ,,http://localhost:5173 ')).toEqual([
      'https://a.example.com',
      'http://localhost:5173',
    ])
  })

  it('rejects entries with a path or wildcard', () => {
    expect(() => parseOrigins('https://a.example.com/app')).toThrow(/origin/)
    expect(() => parseOrigins('*')).toThrow(/origin/)
  })
})
