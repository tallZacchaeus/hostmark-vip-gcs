// Registration confirmation to the contact email on the public form (when email is on). The
// guest's registration never depends on it: a failed send is logged (without the address) and
// the on-screen confirmation stays the record they get.
import 'server-only'
import { type Kysely, sql } from 'kysely'
import { withSystem } from '@/lib/db/system'
import type { DB } from '@/lib/db/types'
import { logger } from '@/lib/logger'
import type { Mailer } from '@/lib/mail/mailer'
import { registrationReceivedEmail } from '@/lib/mail/templates'

export interface ConfirmationDetails {
  readonly to: string | null
  readonly guest: string
  readonly eventName: string
  readonly venueName: string
  readonly referenceCode: string
  readonly followUp: boolean
  readonly arrivalDate: string | null
  readonly flightNumber: string | null
}

/** The public form must not be usable to flood someone's inbox from our domain. */
export const CONFIRMATIONS_PER_ADDRESS_PER_DAY = 2
const DAY_MS = 24 * 60 * 60 * 1000

/** Registrations (including the one just stored) that gave this address in the last day. */
async function recentRegistrationsFor(db: Kysely<DB>, address: string, now: Date): Promise<number> {
  const row = await withSystem(db, { actor: 'guest_intake', automatic: false }, (tx) =>
    tx
      .selectFrom('intake_submissions')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where(sql<string>`lower(payload ->> 'contact_email')`, '=', address)
      .where('created_at', '>', new Date(now.getTime() - DAY_MS))
      .executeTakeFirst(),
  )
  return Number(row?.count ?? 0)
}

export async function sendRegistrationConfirmation(db: Kysely<DB>, mailer: Mailer, details: ConfirmationDetails, now = new Date()): Promise<void> {
  if (!mailer.enabled || !details.to) return
  const { to, ...content } = details
  if ((await recentRegistrationsFor(db, to, now)) > CONFIRMATIONS_PER_ADDRESS_PER_DAY) {
    logger.warn('Registration confirmation skipped: daily limit for this address', { reference: details.referenceCode })
    return
  }
  const result = await mailer.send({ to, ...registrationReceivedEmail(content) })
  if (!result.ok) logger.warn('Registration confirmation not sent', { reference: details.referenceCode, reason: result.reason })
}
