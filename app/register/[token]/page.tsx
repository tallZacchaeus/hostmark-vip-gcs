// Public registration page (no sign-in). The link context comes from the database as the trusted
// server role; only the event name, venue and travel dates reach the page, never the token's other settings.
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { RegistrationScreen } from '@/features/registration/RegistrationScreen'
import { RegistrationUnavailable } from '@/features/registration/RegistrationUnavailable'
import { clientIp } from '@/lib/api/client-ip'
import { ApiError } from '@/lib/api/errors'
import { createRateLimiter } from '@/lib/api/rate-limit'
import { getSystemDb } from '@/lib/db/system'
import { getServerEnv } from '@/lib/env'
import { travelWindow } from '@/lib/domain/intake/travel-window'
import { type LinkContext, readLinkContext } from '@/lib/services/intake/public-submit'
import { intakeTokenParamsSchema } from '@/lib/validation/intake'

export const metadata: Metadata = {
  title: 'Register your delegation',
  robots: { index: false, follow: false },
}

/** Each view costs a database lookup, so the page is limited per IP like the API behind it. */
const pageViews = createRateLimiter({ windowMs: 60_000, max: 60 })

async function loadContext(token: string): Promise<LinkContext | null> {
  if (!intakeTokenParamsSchema.safeParse({ token }).success) return null
  try {
    return await readLinkContext(getSystemDb(), token)
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

interface RegisterPageProps {
  readonly params: Promise<{ token: string }>
}

export default async function RegisterPage({ params }: RegisterPageProps) {
  // Reading the request headers also makes the page render per request.
  if (!pageViews.check(clientIp(await headers())).allowed) return <RegistrationUnavailable reason="busy" />
  const { token } = await params
  const context = await loadContext(token)
  if (!context) return <RegistrationUnavailable reason="invalid" />
  if (!context.open) return <RegistrationUnavailable reason="closed" eventName={context.event_name} />
  const travel = travelWindow(context)
  const event = { event_name: context.event_name, venue_name: context.venue_name, travel_from: travel.from, travel_to: travel.to }
  return <RegistrationScreen token={token} event={event} siteKey={getServerEnv().TURNSTILE_SITE_KEY ?? null} />
}
