import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export type ButtonKind = 'primary' | 'approve' | 'secondary' | 'ghost'

interface ButtonProps {
  readonly children: ReactNode
  readonly kind?: ButtonKind
  readonly icon?: IconName
  readonly onClick?: () => void
  readonly type?: 'button' | 'submit'
  readonly disabled?: boolean
  readonly busy?: boolean
  readonly className?: string
  readonly ariaLabel?: string
}

/** The design system's button (hm-button). Shows a spinner icon while `busy`. */
export function Button({
  children,
  kind = 'secondary',
  icon,
  onClick,
  type = 'button',
  disabled,
  busy,
  className = '',
  ariaLabel,
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`hm-button hm-button--${kind} ${className}`.trim()}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      aria-label={ariaLabel}
    >
      {busy ? <Icon name="loader" /> : icon ? <Icon name={icon} /> : null}
      <span>{children}</span>
    </button>
  )
}
