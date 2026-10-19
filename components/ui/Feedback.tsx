// Page-level feedback: error banners with a retry, empty states and "coming soon" placeholders.
import type { ReactNode } from 'react'
import { Button } from './Button'
import { Icon, type IconName } from './Icon'

interface ErrorBannerProps {
  readonly message: string
  readonly onRetry?: () => void
  /** The design gives each page its own banner class (e.g. "guest-error"); defaults to error-banner. */
  readonly className?: string
}

export function ErrorBanner({ message, onRetry, className = 'error-banner' }: ErrorBannerProps) {
  return (
    <div className={className} role="alert">
      <Icon name="alert" />
      <span>{message}</span>
      {onRetry && <Button onClick={onRetry}>Retry</Button>}
    </div>
  )
}

interface EmptyStateProps {
  readonly icon: IconName
  readonly title: string
  readonly children?: ReactNode
  readonly action?: ReactNode
}

/** A purposeful empty state: what it means and what to do next. */
export function EmptyState({ icon, title, children, action }: EmptyStateProps) {
  return (
    <div className="app-empty">
      <span>
        <Icon name={icon} size={26} />
      </span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

interface ComingSoonProps {
  readonly title: string
  readonly description: string
  readonly phase: string
}

/** Placeholder for a screen whose backend phase is not built yet. */
export function ComingSoon({ title, description, phase }: ComingSoonProps) {
  return (
    <main className="coming-soon-page">
      <header className="page-header">
        <h1>{title}</h1>
      </header>
      <section className="coming-soon-card" aria-labelledby="coming-soon-title">
        <span className="coming-soon-icon">
          <Icon name="calendarClock" size={26} />
        </span>
        <h2 id="coming-soon-title">Coming soon</h2>
        <p>{description}</p>
        <small>Arrives with {phase}.</small>
      </section>
    </main>
  )
}
