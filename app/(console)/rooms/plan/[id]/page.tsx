import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PlanScreen } from '@/features/rooms/PlanScreen'
import { PAGE_ACCESS } from '@/lib/auth/page-access'
import { requirePageSession } from '@/lib/auth/page-guard'
import { idParamsSchema } from '@/lib/validation/common'

export const metadata: Metadata = { title: 'Room plan' }

interface PlanPageProps {
  readonly params: Promise<{ id: string }>
}

export default async function RoomPlanPage({ params }: PlanPageProps) {
  await requirePageSession(PAGE_ACCESS.rooms)
  const parsed = idParamsSchema.safeParse(await params)
  if (!parsed.success) notFound()
  return <PlanScreen planId={parsed.data.id} />
}
