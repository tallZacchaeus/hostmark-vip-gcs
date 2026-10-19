// The entry point sends people to their role's home screen, or to sign in.
import { redirect } from 'next/navigation'
import { readPageActor } from '@/lib/auth/page-guard'
import { HOME_ROUTES } from '@/lib/auth/roles'

export default async function HomePage() {
  const resolution = await readPageActor()
  if (resolution.status !== 'active') {
    redirect('/sign-in')
  }
  redirect(resolution.actor.mustChangePassword ? '/account/password' : HOME_ROUTES[resolution.actor.role])
}
