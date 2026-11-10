// The password rules from lib/auth/password-policy.ts, as a checklist the person can see while
// typing (plus "not your email", which the design asks for).
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password-policy'

export interface PasswordRule {
  readonly label: string
  readonly met: boolean
}

/** `email` null: not known on this screen (an emailed password link), so that rule is left out. */
export function passwordRules(password: string, email: string | null): PasswordRule[] {
  const rules: PasswordRule[] = [
    { label: `At least ${MIN_PASSWORD_LENGTH} characters`, met: password.length >= MIN_PASSWORD_LENGTH },
    { label: 'Upper- and lower-case letters', met: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: 'One number', met: /[0-9]/.test(password) },
  ]
  if (email === null) return rules
  return [...rules, { label: 'Not your email', met: password !== '' && password.toLowerCase() !== email.toLowerCase() }]
}

export function allRulesMet(rules: readonly PasswordRule[]): boolean {
  return rules.every((rule) => rule.met)
}
