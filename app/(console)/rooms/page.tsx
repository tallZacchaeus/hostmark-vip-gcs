import type { Metadata } from 'next'
import { RoomsScreen } from '@/features/rooms/RoomsScreen'
import { PAGE_ACCESS } from '@/lib/auth/page-access'
import { requirePageSession } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'Rooms' }

export default async function RoomsPage() {
  await requirePageSession(PAGE_ACCESS.rooms)
  return <RoomsScreen />
}
