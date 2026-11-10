import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SignInScreen } from '@/features/auth/SignInScreen'
import { readPageActor } from '@/lib/auth/page-guard'
import { HOME_ROUTES } from '@/lib/auth/roles'
import { getMailer } from '@/lib/mail/get-mailer'

export const metadata: Metadata = { title: 'Sign in' }

interface SignInPageProps {
  readonly searchParams: Promise<{ reason?: string }>
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const resolution = await readPageActor()
  if (resolution.status === 'active') {
    redirect(resolution.actor.mustChangePassword ? '/account/password' : HOME_ROUTES[resolution.actor.role])
  }
  const { reason } = await searchParams
  return <SignInScreen reason={reason} emailResets={getMailer().enabled} />
}
