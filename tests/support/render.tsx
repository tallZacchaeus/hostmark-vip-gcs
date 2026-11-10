// Renders a component inside the providers the app gives it: a session, toasts and an SWR cache
// that is fresh for every test.
import { render, type RenderResult } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { SessionProvider, type SessionValue } from '@/components/shell/SessionContext'
import { ToastProvider } from '@/components/ui/Toast'
import type { AppRole } from '@/lib/auth/roles'

export function sessionFor(role: AppRole = 'coordinator', flightMode: 'live' | 'simulated' = 'simulated'): SessionValue {
  return {
    user: { id: 'u-1', fullName: 'Ada Nwosu', email: 'ada@example.com', role },
    event: {
      id: 'e-1',
      name: 'Lagos Leadership Summit 2026',
      venue_name: 'Harbour Point Hotel',
      timezone: 'Africa/Lagos',
      starts_on: '2026-10-28',
      ends_on: '2026-10-31',
      flight_mode: flightMode,
    },
    events: [],
    homeRoute: '/dashboard',
  }
}

export function renderWithApp(ui: ReactNode, session: SessionValue = sessionFor()): RenderResult {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <SessionProvider value={session}>
        <ToastProvider>{ui}</ToastProvider>
      </SessionProvider>
    </SWRConfig>,
  )
}
