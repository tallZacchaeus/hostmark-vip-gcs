import { describe, expect, it } from 'vitest'
import { isAuthorizedScheduler } from './scheduler-auth'

const SECRET = 's'.repeat(64)

describe('scheduler authorization', () => {
  it('accepts the exact bearer secret', () => {
    expect(isAuthorizedScheduler(`Bearer ${SECRET}`, SECRET)).toBe(true)
  })

  it('rejects a missing, malformed or different credential', () => {
    expect(isAuthorizedScheduler(null, SECRET)).toBe(false)
    expect(isAuthorizedScheduler('', SECRET)).toBe(false)
    expect(isAuthorizedScheduler(SECRET, SECRET)).toBe(false)
    expect(isAuthorizedScheduler(`Basic ${SECRET}`, SECRET)).toBe(false)
    expect(isAuthorizedScheduler(`Bearer ${SECRET}x`, SECRET)).toBe(false)
    expect(isAuthorizedScheduler(`Bearer ${SECRET.slice(1)}`, SECRET)).toBe(false)
    expect(isAuthorizedScheduler('Bearer ', SECRET)).toBe(false)
  })
})
