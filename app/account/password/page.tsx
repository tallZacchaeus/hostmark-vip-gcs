import type { Metadata } from 'next'
import { ChangePasswordScreen } from '@/features/auth/ChangePasswordScreen'
import { requirePageSession } from '@/lib/auth/page-guard'
import { ANY_ROLE } from '@/lib/auth/roles'

export const metadata: Metadata = { title: 'Change password' }

export default async function ChangePasswordPage() {
  const session = await requirePageSession(ANY_ROLE, { allowPendingPasswordChange: true })
  return (
    <ChangePasswordScreen
      email={session.actor.email}
      forced={session.actor.mustChangePassword}
      homeRoute={session.homeRoute}
    />
  )
}
