import type { Metadata } from 'next'
import { DriverScreen } from '@/features/driver/DriverScreen'
import { PAGE_ACCESS } from '@/lib/auth/page-access'
import { requirePageSession } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'My pickups' }

export default async function DriverPage() {
  await requirePageSession(PAGE_ACCESS.driver)
  return <DriverScreen />
}
