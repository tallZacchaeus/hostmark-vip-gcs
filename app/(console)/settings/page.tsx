import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SettingsScreen } from '@/features/settings/SettingsScreen'
import { PAGE_ACCESS } from '@/lib/auth/page-access'
import { requirePageSession } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  await requirePageSession(PAGE_ACCESS.settings)
  return (
    <Suspense>
      <SettingsScreen />
    </Suspense>
  )
}
