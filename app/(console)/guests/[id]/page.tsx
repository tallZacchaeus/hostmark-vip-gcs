import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { GuestProfileScreen } from '@/features/guests/GuestProfileScreen'
import { PAGE_ACCESS } from '@/lib/auth/page-access'
import { requirePageSession } from '@/lib/auth/page-guard'
import { idParamsSchema } from '@/lib/validation/common'

export const metadata: Metadata = { title: 'Guest profile' }

interface GuestPageProps {
  readonly params: Promise<{ id: string }>
}

export default async function GuestPage({ params }: GuestPageProps) {
  await requirePageSession(PAGE_ACCESS.guests)
  const parsed = idParamsSchema.safeParse(await params)
  if (!parsed.success) notFound()
  return <GuestProfileScreen id={parsed.data.id} />
}
