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

  it('allows the in-process pglite:// database only outside production', () => {
    const local = { ...VALID, DATABASE_URL: 'pglite://.pglite/dev', SERVICE_DATABASE_URL: 'pglite://.pglite/dev' }
    expect(parseServerEnv({ ...local, NODE_ENV: 'development' }).DATABASE_URL).toBe('pglite://.pglite/dev')
    expect(() => parseServerEnv(local)).toThrow(/DATABASE_URL must not use pglite/)
    expect(parseServerEnv({ ...local, ALLOW_PGLITE: 'true' }).DATABASE_URL).toBe('pglite://.pglite/dev')
  })

  it('defaults to no extra origins', () => {
    expect(parseServerEnv({ ...VALID, API_ALLOWED_ORIGINS: undefined }).API_ALLOWED_ORIGINS).toEqual([])
  })

  it('runs the worker in-process, without live flight data, by default', () => {
    const env = parseServerEnv({ ...VALID, AERODATABOX_API_KEY: '' })
    expect(env).toMatchObject({ WORKER_MODE: 'in-process', FLIGHT_POLL_DAILY_LIMIT: 160, AERODATABOX_API_KEY: undefined })
    expect(parseServerEnv({ ...VALID, FLIGHT_POLL_DAILY_LIMIT: '400', WORKER_MODE: 'off' })).toMatchObject({ FLIGHT_POLL_DAILY_LIMIT: 400, WORKER_MODE: 'off' })
    expect(() => parseServerEnv({ ...VALID, FLIGHT_POLL_DAILY_LIMIT: '0' })).toThrow(/FLIGHT_POLL_DAILY_LIMIT/)
    expect(() => parseServerEnv({ ...VALID, WORKER_MODE: 'cron' })).toThrow(/WORKER_MODE/)
  })

  it('listens for notifications on DATABASE_URL unless a separate session-mode URL is given', () => {
    expect(parseServerEnv(VALID).DATABASE_LISTEN_URL).toBeUndefined()
    const listen = 'postgres://vip_app.ref:secret@pooler.example.com:5432/postgres'
    expect(parseServerEnv({ ...VALID, DATABASE_LISTEN_URL: listen }).DATABASE_LISTEN_URL).toBe(listen)
    expect(parseServerEnv({ ...VALID, DATABASE_LISTEN_URL: '' }).DATABASE_LISTEN_URL).toBeUndefined()
    expect(() => parseServerEnv({ ...VALID, DATABASE_LISTEN_URL: 'mysql://db/app' })).toThrow(/DATABASE_LISTEN_URL/)
  })

  it('leaves email off by default and needs a sender once a Resend key is set', () => {
    // Arrange + Act
    const off = parseServerEnv(VALID)
    const on = parseServerEnv({ ...VALID, RESEND_API_KEY: 're_key', MAIL_FROM: 'Hostmark <noreply@hostmark.tech>' })

    // Assert
    expect(off.RESEND_API_KEY).toBeUndefined()
    expect(on.MAIL_FROM).toBe('Hostmark <noreply@hostmark.tech>')
    expect(() => parseServerEnv({ ...VALID, RESEND_API_KEY: 're_key' })).toThrow(/MAIL_FROM/)
    expect(() => parseServerEnv({ ...VALID, RESEND_API_KEY: 're_key', MAIL_FROM: 'not an address' })).toThrow(/MAIL_FROM/)
    expect(() => parseServerEnv({ ...VALID, RESEND_API_KEY: 're_key', MAIL_FROM: 'Hostmark <noreply@hostmark.tech>' })).not.toThrow(/re_key/)
  })

  it('takes an optional address for demo requests and refuses one that is not an address', () => {
    expect(parseServerEnv(VALID).DEMO_REQUEST_TO).toBeUndefined()
    expect(parseServerEnv({ ...VALID, DEMO_REQUEST_TO: ' ' }).DEMO_REQUEST_TO).toBeUndefined()
    expect(parseServerEnv({ ...VALID, DEMO_REQUEST_TO: 'sales@example.com' }).DEMO_REQUEST_TO).toBe('sales@example.com')
    expect(() => parseServerEnv({ ...VALID, DEMO_REQUEST_TO: 'sales' })).toThrow(/DEMO_REQUEST_TO/)
  })

  it('accepts a scheduler secret only when it is long enough', () => {
    expect(parseServerEnv({ ...VALID, CRON_SECRET: '' }).CRON_SECRET).toBeUndefined()
    expect(parseServerEnv({ ...VALID, CRON_SECRET: 'c'.repeat(32) }).CRON_SECRET).toBe('c'.repeat(32))
    expect(() => parseServerEnv({ ...VALID, CRON_SECRET: 'too-short-cron-secret' })).toThrow(/CRON_SECRET/)
    expect(() => parseServerEnv({ ...VALID, CRON_SECRET: 'too-short-cron-secret' })).not.toThrow(/too-short-cron-secret/)
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
