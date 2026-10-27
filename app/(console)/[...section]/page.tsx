// "Coming soon" for console screens whose backend phase is not built yet. A real page at the
// same path takes precedence over this catch-all, so entries are removed as phases land.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ComingSoon } from '@/components/ui/Feedback'
import { PAGE_ACCESS, type PageKey } from '@/lib/auth/page-access'
import { requirePageSession } from '@/lib/auth/page-guard'

interface Placeholder {
  readonly page: PageKey
  readonly title: string
  readonly description: string
  readonly phase: string
}

const PLACEHOLDERS: Readonly<Record<string, Placeholder>> = {
  programme: { page: 'programme', title: 'Programme', description: 'Draft the event programme, list VIP participants and see which items are at risk from late arrivals.', phase: 'phase P6 (event programme)' },}

interface PlaceholderPageProps {
  readonly params: Promise<{ section: string[] }>
}

function placeholderFor(section: readonly string[]): Placeholder | undefined {
  return section.length === 1 ? PLACEHOLDERS[section[0] ?? ''] : undefined
}

export async function generateMetadata({ params }: PlaceholderPageProps): Promise<Metadata> {
  const entry = placeholderFor((await params).section)
  return { title: entry?.title ?? 'Not found' }
}

export default async function PlaceholderPage({ params }: PlaceholderPageProps) {
  const entry = placeholderFor((await params).section)
  if (!entry) notFound()
  await requirePageSession(PAGE_ACCESS[entry.page])
  return <ComingSoon title={entry.title} description={entry.description} phase={entry.phase} />
}
