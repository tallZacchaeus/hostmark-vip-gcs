import type { Metadata } from 'next'
import { SanitationScreen } from '@/features/sanitation/SanitationScreen'
import { PAGE_ACCESS } from '@/lib/auth/page-access'
import { requirePageSession } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'Sanitation' }

export default async function SanitationPage() {
  await requirePageSession(PAGE_ACCESS.sanitation)
  return <SanitationScreen />
}
