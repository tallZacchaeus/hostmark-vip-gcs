// Emailed password links (Resend): a new account's invitation, an admin's reset and the sign-in
// page's "Forgot password?". The link opens /reset-password?token=…, which sets the password
// through Better Auth's /reset-password endpoint; the token works once. Kept free of getAuth()
// so the auth configuration itself can use these callbacks.
import 'server-only'
import { sql } from 'kysely'
import { getSystemDb, withSystem } from '@/lib/db/system'
import { logger } from '@/lib/logger'
import { getMailer } from '@/lib/mail/get-mailer'
import { passwordLinkEmail } from '@/lib/mail/templates'
import { FORGOT_LINK_HOURS, STAFF_LINK_HOURS } from './password-policy'

export { FORGOT_LINK_HOURS, STAFF_LINK_HOURS }

export type PasswordLinkKind = 'invite' | 'admin_reset' | 'forgot'

export function passwordLinkUrl(baseURL: string, token: string): string {
  const url = new URL('/reset-password', baseURL)
  url.searchParams.set('token', token)
  return url.toString()
}

export interface PasswordLinkMail {
  readonly kind: PasswordLinkKind
  readonly to: string
  readonly name: string
  /** Invitations name the role. */
  readonly roleLabel?: string
  readonly token: string
  readonly baseURL: string
}

/** True when Resend accepted the email. Never throws; failures are logged without the address. */
export async function sendPasswordLink(mail: PasswordLinkMail): Promise<boolean> {
  const link = passwordLinkUrl(mail.baseURL, mail.token)
  const content =
    mail.kind === 'invite'
      ? passwordLinkEmail({ kind: 'invite', name: mail.name, roleLabel: mail.roleLabel ?? 'staff', link, validHours: STAFF_LINK_HOURS })
      : passwordLinkEmail({ kind: mail.kind, name: mail.name, link, validHours: mail.kind === 'forgot' ? FORGOT_LINK_HOURS : STAFF_LINK_HOURS })
  const result = await getMailer().send({ to: mail.to, ...content })
  if (!result.ok) logger.warn('Password email not sent', { kind: mail.kind, reason: result.reason })
  return result.ok
}

interface ResetUser {
  readonly email: string
  readonly name: string
  readonly banned?: boolean | null
}

/**
 * Better Auth's sendResetPassword: nothing for deactivated accounts or while email is off. Not
 * awaited, so a real account answers as fast as an unknown address (no enumeration by timing).
 */
export async function sendForgotPasswordEmail(user: ResetUser, token: string, baseURL: string): Promise<void> {
  if (user.banned || !getMailer().enabled) return
  void sendPasswordLink({ kind: 'forgot', to: user.email, name: user.name, token, baseURL }).catch((error: unknown) => {
    logger.error('Password email failed', { kind: 'forgot', error })
  })
}

/** Cancels every unused password link of an account (deactivation, or an email that failed). */
export async function revokePasswordLinks(userId: string): Promise<void> {
  await withSystem(getSystemDb(), { actor: 'system', action: 'auth.password_links_revoked', automatic: false, undoable: false }, (tx) =>
    tx.deleteFrom('auth_verifications').where('identifier', 'like', 'reset-password:%').where('value', '=', userId).execute(),
  )
}

/**
 * Better Auth's onPasswordReset: a password chosen through a link needs no further change. A
 * deactivated account keeps its forced change, so a link used after deactivation is worth nothing
 * if the account is ever reactivated.
 */
export async function completePasswordReset(userId: string): Promise<void> {
  await withSystem(getSystemDb(), { actor: 'system', action: 'profiles.password_set_by_link', automatic: false, undoable: false }, (tx) =>
    tx
      .updateTable('profiles')
      .set({ must_change_password: false })
      .where('id', '=', userId)
      .where(sql<boolean>`not coalesce(banned, false)`)
      .execute(),
  )
}
