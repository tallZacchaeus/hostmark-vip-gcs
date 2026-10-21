// Staff app screens that are not built yet. Real pages at the same path replace this.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ComingSoon } from '@/components/ui/Feedback'
import { PAGE_ACCESS, type PageKey } from '@/lib/auth/page-access'
import { requirePageSession } from '@/lib/auth/page-guard'

const PLACEHOLDERS: Readonly<Record<string, { page: PageKey; title: string; description: string; phase: string }>> = {
  sanitation: {
    page: 'staffSanitation',
    title: 'Sanitation',
    description: 'The rooms to clean next, in priority order, with Start and Mark ready.',
    phase: 'phase P5 (turnaround and cleaning)',
  },
}

interface StaffPlaceholderProps {
  readonly params: Promise<{ section: string }>
}

export async function generateMetadata({ params }: StaffPlaceholderProps): Promise<Metadata> {
  return { title: PLACEHOLDERS[(await params).section]?.title ?? 'Not found' }
}

export default async function StaffPlaceholderPage({ params }: StaffPlaceholderProps) {
  const entry = PLACEHOLDERS[(await params).section]
  if (!entry) notFound()
  await requirePageSession(PAGE_ACCESS[entry.page])
  return <ComingSoon title={entry.title} description={entry.description} phase={entry.phase} />
}
