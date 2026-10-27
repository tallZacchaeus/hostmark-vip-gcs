import type { Metadata } from 'next'
import { HousekeepingScreen } from '@/features/sanitation/HousekeepingScreen'
import { PAGE_ACCESS } from '@/lib/auth/page-access'
import { requirePageSession } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'Sanitation' }

export default async function StaffSanitationPage() {
  await requirePageSession(PAGE_ACCESS.staffSanitation)
  return <HousekeepingScreen />
}
