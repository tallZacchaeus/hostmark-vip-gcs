import type { Metadata } from 'next'
import { EventsScreen } from '@/features/events/EventsScreen'
import { PAGE_ACCESS } from '@/lib/auth/page-access'
import { requirePageSession } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'Events' }

export default async function EventsPage() {
  await requirePageSession(PAGE_ACCESS.events)
  return <EventsScreen />
}
