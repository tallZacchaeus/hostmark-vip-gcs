// Status badges. Every status carries a text label (and often an icon): colour is never the
// only signal (04-UI-UX-Design-Brief.md section 2).
import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral'

interface ChipProps {
  readonly children: ReactNode
  readonly tone: Tone
  readonly icon?: IconName
}

/** Small dashboard chip (status-chip). */
export function StatusChip({ children, tone, icon }: ChipProps) {
  const variant = tone === 'neutral' ? 'info' : tone
  return (
    <span className={`status-chip status-chip--${variant}`}>
      {icon && <Icon name={icon} size={14} />}
      <span>{children}</span>
    </span>
  )
}

/** Violet "Suggested" marker for anything awaiting a decision. */
export function SuggestedChip({ label = 'Suggested' }: { readonly label?: string }) {
  return (
    <span className="suggested-chip">
      <Icon name="sparkle" size={13} />
      {label}
    </span>
  )
}

interface PillProps {
  readonly children: ReactNode
  readonly tone: Tone | 'suggested'
  readonly icon?: IconName
}

/** Table and profile status pill (guest-status). */
export function Pill({ children, tone, icon }: PillProps) {
  return (
    <span className={`guest-status guest-status--${tone}`}>
      {tone === 'suggested' && !icon ? <Icon name="sparkle" size={13} /> : icon ? <Icon name={icon} size={13} /> : null}
      <span>{children}</span>
    </span>
  )
}

/** Board badge (arrival-badge), used on arrivals, transport, rooms and cleaning. */
export function Badge({ children, tone, icon }: ChipProps) {
  return (
    <span className={`arrival-badge arrival-badge--${tone}`}>
      {icon && <Icon name={icon} size={13} />}
      {children}
    </span>
  )
}

/** "AUTO": set by the system, not a person. */
export function AutoTag() {
  return <span className="auto-tag">AUTO</span>
}

export function Skeleton({ className = '' }: { readonly className?: string }) {
  return <span className={`skeleton ${className}`.trim()} aria-hidden="true" />
}
