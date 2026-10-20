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
  programme: { page: 'programme', title: 'Programme', description: 'Draft the event programme, list VIP participants and see which items are at risk from late arrivals.', phase: 'phase P6 (event programme)' },
  arrivals: { page: 'arrivals', title: 'Arrivals', description: 'Live flight status, pickups and drivers for everyone arriving today.', phase: 'phase P3 (flights and transport)' },
  transport: { page: 'transport', title: 'Transport', description: 'The driver board: pickups by driver, suggested assignments and reassignments.', phase: 'phase P3 (flights and transport)' },
  rooms: { page: 'rooms', title: 'Rooms', description: 'The room grid by floor and wing, the allocator and manual moves with rule checks.', phase: 'phase P4 (room allocation)' },
  sanitation: { page: 'sanitation', title: 'Sanitation', description: 'Rooms waiting to be cleaned, in priority order, with estimated ready times.', phase: 'phase P5 (turnaround and cleaning)' },
  simulation: { page: 'simulation', title: 'Simulation', description: 'Try a flight delay or a room change and see what would move before it happens.', phase: 'phase P3 (flights and transport)' },
}

interface PlaceholderPageProps {
  readonly params: Promise<{ section: string[] }>
}

function placeholderFor(section: readonly string[]): Placeholder | undefined {
  return section.length === 1 || section[0] === 'rooms'
    ? PLACEHOLDERS[section[0] ?? '']
    : undefined
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
