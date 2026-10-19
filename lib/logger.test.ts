import { afterEach, describe, expect, it, vi } from 'vitest'
import { logger } from './logger'

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes one JSON line per entry: info to stdout, warnings and errors to stderr', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    logger.info('Server started', { port: 3000 })
    logger.warn('Slow query', { ms: 900 })
    logger.error('Request failed', { error: Object.assign(new Error('boom'), { code: '57P01' }) })

    const info = JSON.parse(String(stdout.mock.calls[0]?.[0]))
    expect(info).toMatchObject({ level: 'info', message: 'Server started', port: 3000 })
    expect(stderr).toHaveBeenCalledTimes(2)
    const error = JSON.parse(String(stderr.mock.calls[1]?.[0]))
    expect(error.error).toMatchObject({ name: 'Error', message: 'boom', code: '57P01' })
    expect(error.error.stack).toContain('Error: boom')
  })
})
