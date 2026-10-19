'use client'
// App-wide client providers: SWR defaults (and what to do when the session ends) and toasts.
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { ToastProvider } from '@/components/ui/Toast'
import { ApiClientError } from '@/lib/client/api'
import { apiFetcher } from '@/lib/client/use-api'

const NO_RETRY_CODES = new Set(['unauthenticated', 'account_inactive', 'password_change_required', 'forbidden', 'not_found'])

// Full page loads on purpose: when the session ends, every cached response must be dropped.
/* eslint-disable @next/next/no-location-assign-relative-destination */
function onError(error: unknown): void {
  if (!(error instanceof ApiClientError)) return
  if (error.code === 'unauthenticated') window.location.assign('/sign-in')
  if (error.code === 'account_inactive') window.location.assign('/sign-in?reason=inactive')
  if (error.code === 'password_change_required') window.location.assign('/account/password')
}
/* eslint-enable @next/next/no-location-assign-relative-destination */

export function AppProviders({ children }: { readonly children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: apiFetcher,
        onError,
        revalidateOnFocus: true,
        dedupingInterval: 2_000,
        shouldRetryOnError: (error: unknown) => !(error instanceof ApiClientError && NO_RETRY_CODES.has(error.code)),
        errorRetryCount: 3,
      }}
    >
      <ToastProvider>{children}</ToastProvider>
    </SWRConfig>
  )
}
