'use client'
// The phone app for drivers, front desk and housekeeping. Each screen draws its own phone frame
// and tab bar (as in the design); the shell provides the session and live refresh.
import type { ReactNode } from 'react'
import { useNotificationStream } from '@/lib/client/realtime'
import { refreshApi } from '@/lib/client/use-api'
import { SessionProvider, type SessionValue } from './SessionContext'
import { SimBanner } from './SimBanner'

function LiveRefresh() {
  useNotificationStream(() => {
    void refreshApi('/api/')
  })
  return null
}

export function StaffShell({ session, children }: { readonly session: SessionValue; readonly children: ReactNode }) {
  return (
    <SessionProvider value={session}>
      <LiveRefresh />
      <div className="staff-app">
        <SimBanner />
        {children}
      </div>
    </SessionProvider>
  )
}
