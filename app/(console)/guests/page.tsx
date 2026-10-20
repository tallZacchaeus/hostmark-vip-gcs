import type { Metadata } from 'next'
import { GuestsScreen } from '@/features/guests/GuestsScreen'
import { PAGE_ACCESS } from '@/lib/auth/page-access'
import { requirePageSession } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'Guests' }

export default async function GuestsPage() {
  await requirePageSession(PAGE_ACCESS.guests)
  return <GuestsScreen />
}
