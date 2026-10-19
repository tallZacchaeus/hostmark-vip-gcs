import type { Metadata } from 'next'
import { ComingSoon } from '@/components/ui/Feedback'
import { PAGE_ACCESS } from '@/lib/auth/page-access'
import { requirePageSession } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'My pickups' }

export default async function DriverPage() {
  await requirePageSession(PAGE_ACCESS.driver)
  return (
    <ComingSoon
      title="My pickups"
      description="Your pickups for today with live flight status, and one button to update each trip."
      phase="phase P3 (flights and transport)"
    />
  )
}
