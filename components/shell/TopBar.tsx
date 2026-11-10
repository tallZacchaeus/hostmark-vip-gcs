'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { formatDay, formatTime, initials } from '@/lib/client/format'
import { signOut } from '@/lib/client/session-actions'
import { COORDINATOR_PLUS, hasAnyRole } from '@/lib/auth/roles'
import { EventSwitcher } from './EventSwitcher'
import { useSession } from './SessionContext'
import { SimBadge } from './SimBanner'
import { useNow } from './useNow'

interface TopBarProps {
  readonly onOpenMenu: () => void
  readonly onOpenCopilot: () => void
  readonly onOpenNotifications: () => void
  readonly unreadCount: number
}

function SearchField() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = query.trim()
    if (text) router.push(`/guests?q=${encodeURIComponent(text)}`)
  }
  return (
    <form className="search-wrap" role="search" onSubmit={submit}>
      <label className="search-field-v4">
        <Icon name="search" size={18} />
        <span className="visually-hidden">Search guests</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guest, flight or reference..." />
      </label>
    </form>
  )
}

function UserMenu() {
  const { user } = useSession()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return undefined
    const close = () => setOpen(false)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="topbar-user-menu" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="avatar-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.fullName}`}
        onClick={() => setOpen((value) => !value)}
      >
        {initials(user.fullName)}
      </button>
      <Icon name="chevron" size={14} />
      {open && (
        <div role="menu">
          <Link role="menuitem" href="/account/password" className="menu-link">
            <Icon name="shield" size={17} />
            Change password
          </Link>
          <button type="button" role="menuitem" onClick={() => void signOut()}>
            <Icon name="logOut" size={17} />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export function TopBar({ onOpenMenu, onOpenCopilot, onOpenNotifications, unreadCount }: TopBarProps) {
  const { user, event } = useSession()
  const now = useNow()
  const timeZone = event?.timezone ?? 'UTC'
  const canUseCopilot = hasAnyRole(user.role, COORDINATOR_PLUS)

  return (
    <header className="topbar-v4">
      <button type="button" className="menu-button" aria-label="Open menu" onClick={onOpenMenu}>
        <Icon name="menu" />
      </button>
      {canUseCopilot ? <SearchField /> : <span className="search-wrap" />}
      <div className="topbar-actions">
        <EventSwitcher />
        <SimBadge />
        <span className="topbar-time" aria-label="Event time">
          <Icon name="clock" size={17} />
          {now ? `${formatTime(now, timeZone)} · ${formatDay(now, timeZone)}` : ''}
        </span>
        {canUseCopilot && (
          <Button icon="sparkle" onClick={onOpenCopilot}>
            Ask Victoria
          </Button>
        )}
        <button
          type="button"
          className="icon-button-v4"
          aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          onClick={onOpenNotifications}
        >
          <Icon name="bell" />
          {unreadCount > 0 && <i />}
        </button>
        <UserMenu />
      </div>
    </header>
  )
}
