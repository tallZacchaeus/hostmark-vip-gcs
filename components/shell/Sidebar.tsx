'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from '@/components/ui/Icon'
import { type PageKey, PAGE_PATHS, canOpenPage } from '@/lib/auth/page-access'
import { formatDay, formatTime, initials } from '@/lib/client/format'
import { ROLE_LABELS } from '@/lib/client/labels'
import { useSession } from './SessionContext'
import { useNow } from './useNow'

interface NavItem {
  readonly page: PageKey
  readonly label: string
  readonly icon: IconName
}

const PRIMARY_NAV: readonly NavItem[] = [
  { page: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { page: 'programme', label: 'Programme', icon: 'calendar' },
  { page: 'guests', label: 'Guests', icon: 'users' },
  { page: 'intake', label: 'Intake', icon: 'inbox' },
  { page: 'arrivals', label: 'Arrivals', icon: 'plane' },
  { page: 'transport', label: 'Transport', icon: 'car' },
  { page: 'rooms', label: 'Rooms', icon: 'bed' },
  { page: 'sanitation', label: 'Sanitation', icon: 'spray' },
]

const SECONDARY_NAV: readonly NavItem[] = [
  { page: 'activity', label: 'Activity', icon: 'activity' },
  { page: 'simulation', label: 'Simulation', icon: 'flask' },
  { page: 'events', label: 'Events', icon: 'calendarClock' },
  { page: 'settings', label: 'Settings', icon: 'settings' },
]

interface SidebarProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly counts?: Partial<Record<PageKey, number>>
}

function NavList({ items, counts, onNavigate }: { readonly items: readonly NavItem[]; readonly counts: SidebarProps['counts']; readonly onNavigate: () => void }) {
  const pathname = usePathname()
  const { user } = useSession()
  const visible = items.filter((item) => canOpenPage(user.role, item.page))
  if (visible.length === 0) return null
  return (
    <nav aria-label="Main">
      {visible.map((item) => {
        const href = PAGE_PATHS[item.page]
        const active = pathname === href || pathname.startsWith(`${href}/`)
        const count = counts?.[item.page]
        return (
          <Link
            key={item.page}
            href={href}
            className={`sidebar-item ${active ? 'is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={onNavigate}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
            {count ? <b aria-label={`${count} waiting`}>{count}</b> : null}
          </Link>
        )
      })}
    </nav>
  )
}

export function Sidebar({ open, onClose, counts }: SidebarProps) {
  const { user, event } = useSession()
  const now = useNow()
  const timeZone = event?.timezone ?? 'UTC'

  return (
    <>
      <aside className={`sidebar-v4 ${open ? 'is-open' : ''}`} aria-label="Sidebar">
        <div className="sidebar-brand">
          <img src="/hostmark-logo-C.svg" alt="" width={40} height={40} />
          <div>
            <b>
              <span>Host</span>mark
            </b>
            <small>Guest coordination</small>
          </div>
        </div>
        <div className="sidebar-navigation">
          <NavList items={PRIMARY_NAV} counts={counts} onNavigate={onClose} />
          <div className="sidebar-divider" />
          <NavList items={SECONDARY_NAV} counts={counts} onNavigate={onClose} />
        </div>
        <div className="sidebar-footer">
          {event && (
            <section className="event-card-v4" aria-label="Event">
              <div className="event-thumb" />
              <div>
                <b>{event.name}</b>
                <p>{event.venue_name}</p>
              </div>
              <span>
                <Icon name="calendar" size={16} />
                {now ? formatDay(now, timeZone) : ''}
              </span>
              <span>
                <Icon name="clock" size={16} />
                {now ? formatTime(now, timeZone) : ''}
              </span>
            </section>
          )}
          <div className="sidebar-user">
            <span aria-hidden="true">{initials(user.fullName)}</span>
            <div>
              <b>{user.fullName}</b>
              <small>{ROLE_LABELS[user.role]}</small>
            </div>
          </div>
        </div>
      </aside>
      {open && <button type="button" className="sidebar-backdrop" aria-label="Close menu" onClick={onClose} />}
    </>
  )
}
