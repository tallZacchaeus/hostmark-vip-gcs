'use client'
// The console frame from the design: sidebar, top bar, the Co-Pilot and notification drawers,
// and the live notification stream that keeps every screen fresh.
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { type ReactNode, useCallback, useState } from 'react'
import type { PageKey } from '@/lib/auth/page-access'
import { COORDINATOR_PLUS, hasAnyRole } from '@/lib/auth/roles'
import { useNotificationStream } from '@/lib/client/realtime'
import { routeClass } from '@/lib/client/route-class'
import { refreshApi, useApi } from '@/lib/client/use-api'
import { NOTIFICATIONS_PATH, type NotificationList, NotificationsDrawer } from './NotificationsDrawer'
import { SessionProvider, type SessionValue, useSession } from './SessionContext'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

const CopilotDrawer = dynamic(() => import('@/features/copilot/CopilotDrawer').then((module) => module.CopilotDrawer))

type Panel = 'copilot' | 'notifications' | null

function ConsoleFrame({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [panel, setPanel] = useState<Panel>(null)
  const notifications = useApi<NotificationList>(NOTIFICATIONS_PATH)
  const closePanel = useCallback(() => setPanel(null), [])

  // Any server-side change refreshes the open screen's data through the API.
  useNotificationStream(() => {
    void refreshApi('/api/')
  })

  // The summary is coordinator-only; the programmes team shares this shell without the counts.
  const { user } = useSession()
  const summary = useApi<{ intake_to_review: number }>(hasAnyRole(user.role, COORDINATOR_PLUS) ? '/api/dashboard/summary' : null)
  const sidebarCounts: Partial<Record<PageKey, number>> = summary.data?.intake_to_review ? { intake: summary.data.intake_to_review } : {}

  return (
    <div className={`app-shell-v4 route-${routeClass(pathname)}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} counts={sidebarCounts} />
      <div className="workspace-v4">
        <TopBar
          onOpenMenu={() => setMenuOpen(true)}
          onOpenCopilot={() => setPanel('copilot')}
          onOpenNotifications={() => setPanel('notifications')}
          unreadCount={notifications.data?.unread_count ?? 0}
        />
        <span id="main-content" tabIndex={-1} className="main-anchor" />
        {children}
      </div>
      {panel === 'copilot' && <CopilotDrawer onClose={closePanel} />}
      {panel === 'notifications' && <NotificationsDrawer onClose={closePanel} />}
    </div>
  )
}

export function ConsoleShell({ session, children }: { readonly session: SessionValue; readonly children: ReactNode }) {
  return (
    <SessionProvider value={session}>
      <ConsoleFrame>{children}</ConsoleFrame>
    </SessionProvider>
  )
}
