import { describe, expect, it } from 'vitest'
import { TEMPORARY_PASSWORD_LENGTH, generateTemporaryPassword } from './temporary-password'

describe('generateTemporaryPassword', () => {
  it('meets the auth policy: long enough, with lower, upper and digit characters', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const password = generateTemporaryPassword()
      expect(password).toHaveLength(TEMPORARY_PASSWORD_LENGTH)
      expect(password).toMatch(/[a-z]/)
      expect(password).toMatch(/[A-Z]/)
      expect(password).toMatch(/[0-9]/)
    }
  })

  it('avoids characters that are easy to misread when read aloud or copied', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      expect(generateTemporaryPassword()).not.toMatch(/[lIO01]/)
    }
  })

  it('uses the injected random source', () => {
    const alwaysFirst = (): number => 0
    expect(generateTemporaryPassword(alwaysFirst)).toBe(generateTemporaryPassword(alwaysFirst))
  })

  it('does not repeat across calls with real randomness', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateTemporaryPassword()))
    expect(seen.size).toBe(50)
  })
})
