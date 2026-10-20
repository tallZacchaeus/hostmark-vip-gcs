import type { Metadata } from 'next'
import { ArrivalsScreen } from '@/features/arrivals/ArrivalsScreen'
import { PAGE_ACCESS } from '@/lib/auth/page-access'
import { requirePageSession } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'Arrivals' }

export default async function ArrivalsPage() {
  await requirePageSession(PAGE_ACCESS.arrivals)
  return <ArrivalsScreen />
}
