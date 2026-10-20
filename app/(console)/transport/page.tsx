import type { Metadata } from 'next'
import { TransportScreen } from '@/features/transport/TransportScreen'
import { PAGE_ACCESS } from '@/lib/auth/page-access'
import { requirePageSession } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'Transport' }

export default async function TransportPage() {
  await requirePageSession(PAGE_ACCESS.transport)
  return <TransportScreen />
}
