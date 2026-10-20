import type { Metadata } from 'next'
import { IntakeScreen } from '@/features/intake/IntakeScreen'
import { PAGE_ACCESS } from '@/lib/auth/page-access'
import { requirePageSession } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'Intake' }

export default async function IntakePage() {
  await requirePageSession(PAGE_ACCESS.intake)
  return <IntakeScreen />
}
