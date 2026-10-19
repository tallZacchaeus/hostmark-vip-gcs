'use client'
// FR-PL-10: whenever flight data is simulated, every screen says so, so nobody mistakes a demo or
// a test run for live operations. The console shows a badge in the top bar (always visible);
// the staff app shows a strip above its screens.
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { useSession } from './SessionContext'

export function SimBadge() {
  const { event, user } = useSession()
  if (event?.flight_mode !== 'simulated') return null
  const label = (
    <>
      <Icon name="flask" size={15} />
      <span>Simulated</span>
    </>
  )
  const title = 'Flight data is simulated, not live'
  return user.role === 'super_admin' || user.role === 'admin' ? (
    <Link className="sim-badge" href="/settings?tab=system" title={title} aria-label={`${title}. Open flight data settings.`}>
      {label}
    </Link>
  ) : (
    <span className="sim-badge" title={title} role="note" aria-label={title}>
      {label}
    </span>
  )
}

export function SimBanner() {
  const { event } = useSession()
  if (event?.flight_mode !== 'simulated') return null
  return (
    <div className="sim-banner" role="note">
      <Icon name="flask" size={16} />
      <b>Simulated mode</b>
      <span>Flight data is simulated, not live.</span>
    </div>
  )
}
