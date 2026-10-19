import type { Metadata } from 'next'
import { ActivityScreen } from '@/features/activity/ActivityScreen'
import { PAGE_ACCESS } from '@/lib/auth/page-access'
import { requirePageSession } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'Activity' }

export default async function ActivityPage() {
  await requirePageSession(PAGE_ACCESS.activity)
  return <ActivityScreen />
}
