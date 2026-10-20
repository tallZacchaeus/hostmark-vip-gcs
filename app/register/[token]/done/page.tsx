// Confirmation after a public registration; the receipt is read from this browser tab only.
import type { Metadata } from 'next'
import { ConfirmationScreen } from '@/features/registration/ConfirmationScreen'

export const metadata: Metadata = {
  title: 'Registration received',
  robots: { index: false, follow: false },
}

interface DonePageProps {
  readonly params: Promise<{ token: string }>
}

export default async function RegistrationDonePage({ params }: DonePageProps) {
  const { token } = await params
  return <ConfirmationScreen token={token} />
}
