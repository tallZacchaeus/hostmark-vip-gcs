import { describe, expect, it } from 'vitest'
import { pgliteDataDir, pgliteOpenError } from './pglite-database'

describe('local PGlite database', () => {
  it('reads the data directory from the URL', () => {
    expect(pgliteDataDir('pglite://.pglite/dev')).toBe('.pglite/dev')
    expect(pgliteDataDir('pglite://memory')).toBeUndefined()
  })

  it('turns a bare "Aborted()" into something a person can act on, keeping the cause', () => {
    const cause = new Error('Aborted(). Build with -sASSERTIONS for more info.')
    const error = pgliteOpenError('.pglite/dev', cause)
    expect(error.message).toMatch(/\.pglite\/dev could not be opened/)
    expect(error.message).toMatch(/pnpm local:setup/)
    expect(error.cause).toBe(cause)
    expect(pgliteOpenError(undefined, cause).message).toMatch(/in-memory/)
  })
})
