// How a new or reset staff password reaches its owner. With email on, they get a one-time link
// (valid STAFF_LINK_HOURS) and nobody ever sees a password; the temporary password that was set
// stays unknown and is replaced through the link. With email off, or when the email fails, the
// admin sees the temporary password once, as before, so nobody is left without a way in.
import 'server-only'
import { randomBytes } from 'node:crypto'
import { getAuth } from '@/lib/auth/auth'
import { type PasswordLinkKind, STAFF_LINK_HOURS, revokePasswordLinks, sendPasswordLink } from '@/lib/auth/password-links'
import type { AppRole } from '@/lib/auth/roles'
import { ROLE_LABELS } from '@/lib/client/labels'
import { logger } from '@/lib/logger'
import { getMailer } from '@/lib/mail/get-mailer'

const TOKEN_BYTES = 24
const HOUR_MS = 60 * 60 * 1000

export type PasswordDelivery = 'emailed' | 'email_failed' | 'shown'

export interface DeliveredPassword {
  /** Shown to the admin once; null when the owner got a link by email instead. */
  readonly temporaryPassword: string | null
  readonly delivery: PasswordDelivery
}

interface Recipient {
  readonly id: string
  readonly email: string
  readonly full_name: string
  readonly role: AppRole
}

/**
 * A reset token Better Auth's /reset-password accepts (same "reset-password:<token>" record its
 * own "Forgot password?" creates), but valid for longer than a self-service request.
 */
async function issueStaffLinkToken(userId: string): Promise<string> {
  const context = await getAuth().$context
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  await context.internalAdapter.createVerificationValue({
    value: userId,
    identifier: `reset-password:${token}`,
    expiresAt: new Date(Date.now() + STAFF_LINK_HOURS * HOUR_MS),
  })
  return token
}

export async function deliverPassword(kind: Exclude<PasswordLinkKind, 'forgot'>, recipient: Recipient, temporaryPassword: string): Promise<DeliveredPassword> {
  if (!getMailer().enabled) return { temporaryPassword, delivery: 'shown' }
  try {
    const token = await issueStaffLinkToken(recipient.id)
    const sent = await sendPasswordLink({
      kind,
      to: recipient.email,
      name: recipient.full_name,
      roleLabel: ROLE_LABELS[recipient.role],
      token,
      baseURL: getAuth().options.baseURL ?? '',
    })
    if (sent) return { temporaryPassword: null, delivery: 'emailed' }
    // The admin hands over the temporary password instead: no link should stay usable.
    await revokePasswordLinks(recipient.id)
  } catch (error: unknown) {
    logger.error('Password link could not be issued', { userId: recipient.id, error })
  }
  return { temporaryPassword, delivery: 'email_failed' }
}
