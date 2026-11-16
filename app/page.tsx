// The entry point: signed-in staff go to their role's home screen; everyone else sees the public
// landing page (what Hostmark is, a demo request and the staff sign-in).
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LandingScreen } from '@/features/landing/LandingScreen'
import { readPageActor } from '@/lib/auth/page-guard'
import { HOME_ROUTES } from '@/lib/auth/roles'

export const metadata: Metadata = {
  title: { absolute: 'Hostmark · VIP guest coordination for events' },
  description:
    'Registration, flights, drivers, rooms and the programme for VIP events in one live view. When a flight is late, Hostmark re-plans the pickup and the room for your team to approve.',
  // The rest of the app is a staff tool kept out of search engines; this page is meant to be found.
  robots: { index: true, follow: false },
}

export default async function HomePage() {
  const resolution = await readPageActor()
  if (resolution.status === 'active') {
    redirect(resolution.actor.mustChangePassword ? '/account/password' : HOME_ROUTES[resolution.actor.role])
  }
  return <LandingScreen />
}
