import type { Metadata } from 'next'
import { ResetPasswordScreen } from '@/features/auth/ResetPasswordScreen'

export const metadata: Metadata = { title: 'Choose your password', referrer: 'no-referrer' }

interface ResetPasswordPageProps {
  readonly searchParams: Promise<{ token?: string }>
}

// Opened from an emailed link. The token is checked (and used up) only when the form is saved.
export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token } = await searchParams
  return <ResetPasswordScreen token={typeof token === 'string' ? token : ''} />
}
