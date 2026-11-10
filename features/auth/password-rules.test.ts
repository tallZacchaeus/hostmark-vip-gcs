import { describe, expect, it } from 'vitest'
import { allRulesMet, passwordRules } from './password-rules'

describe('passwordRules', () => {
  it('meets every rule for a strong password', () => {
    expect(allRulesMet(passwordRules('Securepass1', 'ada@example.com'))).toBe(true)
  })

  it('reports each unmet rule', () => {
    const rules = passwordRules('short', 'ada@example.com')
    expect(rules.filter((rule) => !rule.met).map((rule) => rule.label)).toEqual([
      'At least 10 characters',
      'Upper- and lower-case letters',
      'One number',
    ])
  })

  it('rejects the email address as a password', () => {
    const rules = passwordRules('Ada@Example.com1', 'ada@example.com1')
    expect(rules.find((rule) => rule.label === 'Not your email')?.met).toBe(false)
  })

  it('leaves out the email rule when the email is not known (a password link)', () => {
    const rules = passwordRules('Securepass1', null)
    expect(rules.map((rule) => rule.label)).not.toContain('Not your email')
    expect(allRulesMet(rules)).toBe(true)
  })

  it('does not count an empty password as different from the email', () => {
    expect(passwordRules('', 'ada@example.com').at(-1)?.met).toBe(false)
  })
})
