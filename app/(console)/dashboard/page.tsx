import type { Metadata } from 'next'
import { DashboardScreen } from '@/features/dashboard/DashboardScreen'
import { PAGE_ACCESS } from '@/lib/auth/page-access'
import { requirePageSession } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  await requirePageSession(PAGE_ACCESS.dashboard)
  return <DashboardScreen />
}
