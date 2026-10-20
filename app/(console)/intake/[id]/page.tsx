import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ReviewScreen } from '@/features/intake/ReviewScreen'
import { PAGE_ACCESS } from '@/lib/auth/page-access'
import { requirePageSession } from '@/lib/auth/page-guard'
import { idParamsSchema } from '@/lib/validation/common'

export const metadata: Metadata = { title: 'Review submission' }

interface ReviewPageProps {
  readonly params: Promise<{ id: string }>
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  await requirePageSession(PAGE_ACCESS.intake)
  const parsed = idParamsSchema.safeParse(await params)
  if (!parsed.success) notFound()
  return <ReviewScreen id={parsed.data.id} />
}
