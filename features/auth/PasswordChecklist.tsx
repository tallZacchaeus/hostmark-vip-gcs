// The live password checklist under "New password" (change-password and password-link screens).
import { Icon } from '@/components/ui/Icon'
import type { PasswordRule } from './password-rules'

export function PasswordChecklist({ rules, matches }: { readonly rules: readonly PasswordRule[]; readonly matches: boolean }) {
  return (
    <div className="password-rules" id="password-rules" aria-live="polite">
      {[...rules, { label: 'Both new passwords match', met: matches }].map((rule) => (
        <p className={rule.met ? 'is-met' : ''} key={rule.label}>
          {rule.met ? <Icon name="check" size={15} /> : <i aria-hidden="true" />}
          <span>
            {rule.label}
            <span className="visually-hidden">{rule.met ? ' (met)' : ' (not met yet)'}</span>
          </span>
        </p>
      ))}
    </div>
  )
}
