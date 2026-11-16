// Outgoing email through Resend (https://resend.com): staff invitations and password links, and
// registration confirmations to guests. Without RESEND_API_KEY mail is off and callers fall back
// (temporary passwords shown on screen, confirmations on screen only). A failed send never throws:
// callers decide what to do, and nothing about the message is logged here.
// Plain fetch against the REST API (one endpoint) instead of the SDK keeps the image small.

const SEND_URL = 'https://api.resend.com/emails'
const SEND_TIMEOUT_MS = 10_000

export interface MailMessage {
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly html: string
  /** Where replies go (e.g. the person who filled in a form), when not the sender. */
  readonly replyTo?: string
}

export type SendResult = { readonly ok: true; readonly id: string | null } | { readonly ok: false; readonly reason: string }

export interface Mailer {
  /** False when no API key is configured: send() then does nothing. */
  readonly enabled: boolean
  send(message: MailMessage): Promise<SendResult>
}

export interface ResendConfig {
  readonly apiKey: string | undefined
  /** Sender, e.g. "Hostmark <noreply@hostmark.tech>"; its domain must be verified in Resend. */
  readonly from: string | undefined
}

type FetchLike = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>

export function createResendMailer(config: ResendConfig, fetchFn: FetchLike = fetch): Mailer {
  const { apiKey, from } = config
  if (!apiKey || !from) {
    return { enabled: false, send: async () => ({ ok: false, reason: 'not_configured' }) }
  }
  return {
    enabled: true,
    async send(message) {
      try {
        const response = await fetchFn(SEND_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
            ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          }),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        })
        if (!response.ok) return { ok: false, reason: `rejected_${response.status}` }
        const body = (await response.json()) as { id?: unknown }
        return { ok: true, id: typeof body.id === 'string' ? body.id : null }
      } catch {
        return { ok: false, reason: 'unreachable' }
      }
    },
  }
}
