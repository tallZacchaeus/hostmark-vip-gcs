// The app's mailer, built once from RESEND_API_KEY and MAIL_FROM. Tests inject their own.
import 'server-only'
import { getServerEnv } from '@/lib/env'
import { type Mailer, createResendMailer } from './mailer'

let instance: Mailer | undefined

export function getMailer(): Mailer {
  if (!instance) {
    const env = getServerEnv()
    instance = createResendMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM })
  }
  return instance
}

export function setMailerForTesting(replacement: Mailer | undefined): void {
  instance = replacement
}
