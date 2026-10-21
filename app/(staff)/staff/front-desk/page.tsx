import type { Metadata } from 'next'
import { FrontDeskScreen } from '@/features/front-desk/FrontDeskScreen'
import { PAGE_ACCESS } from '@/lib/auth/page-access'
import { requirePageSession } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'Front desk' }

export default async function FrontDeskPage() {
  await requirePageSession(PAGE_ACCESS.frontDesk)
  return <FrontDeskScreen />
}
