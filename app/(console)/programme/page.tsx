import type { Metadata } from 'next'
import { ProgrammeScreen } from '@/features/programme/ProgrammeScreen'
import { PAGE_ACCESS } from '@/lib/auth/page-access'
import { requirePageSession } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'Programme' }

export default async function ProgrammePage() {
  await requirePageSession(PAGE_ACCESS.programme)
  return <ProgrammeScreen />
}
