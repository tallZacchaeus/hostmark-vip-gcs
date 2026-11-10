import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { ForgotPasswordScreen } from '@/features/auth/ForgotPasswordScreen'
import { getMailer } from '@/lib/mail/get-mailer'

export const metadata: Metadata = { title: 'Forgot password' }

// Without email there is nothing to send: the sign-in page explains whom to ask instead. Rendered
// per request, since whether email is on is a runtime setting (not known at build time).
export default async function ForgotPasswordPage() {
  await connection()
  if (!getMailer().enabled) redirect('/sign-in')
  return <ForgotPasswordScreen />
}
