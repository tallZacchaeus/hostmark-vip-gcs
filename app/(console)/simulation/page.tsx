import type { Metadata } from 'next'
import { SimulationScreen } from '@/features/simulation/SimulationScreen'
import { PAGE_ACCESS } from '@/lib/auth/page-access'
import { requirePageSession } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'Simulation' }

export default async function SimulationPage() {
  await requirePageSession(PAGE_ACCESS.simulation)
  return <SimulationScreen />
}
