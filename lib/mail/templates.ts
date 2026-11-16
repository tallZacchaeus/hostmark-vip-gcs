// Email bodies, each as plain text and simple HTML (inline styles: mail clients ignore <style>).
// Every value that came from a person (names, event details) is escaped in the HTML.
import type { MailMessage } from './mailer'

type Content = Omit<MailMessage, 'to'>

const BRAND = 'Hostmark'
const ACCENT = '#1f4e79'

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const hours = (count: number): string => (count === 1 ? '1 hour' : `${count} hours`)

interface Block {
  readonly paragraphs: readonly string[]
  readonly button?: { readonly label: string; readonly href: string }
  readonly details?: ReadonlyArray<readonly [label: string, value: string]>
  readonly footer?: string
}

/** One layout for every email: greeting paragraphs, an optional button and detail rows. */
function render(block: Block): { text: string; html: string } {
  const detailLines = (block.details ?? []).map(([label, value]) => `${label}: ${value}`)
  const text = [
    ...block.paragraphs,
    ...(block.button ? [`${block.button.label}: ${block.button.href}`] : []),
    ...(detailLines.length ? [detailLines.join('\n')] : []),
    ...(block.footer ? [block.footer] : []),
    `— ${BRAND}`,
  ].join('\n\n')

  const paragraphs = block.paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join('')
  const button = block.button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(block.button.href)}" style="background:${ACCENT};color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(block.button.label)}</a></p>` +
      `<p style="margin:0 0 16px;font-size:13px;color:#555">Or open this link: ${escapeHtml(block.button.href)}</p>`
    : ''
  const details = block.details?.length
    ? `<table style="border-collapse:collapse;margin:0 0 16px">${block.details
        .map(([label, value]) => `<tr><td style="padding:4px 16px 4px 0;color:#555">${escapeHtml(label)}</td><td style="padding:4px 0;font-weight:600">${escapeHtml(value)}</td></tr>`)
        .join('')}</table>`
    : ''
  const footer = block.footer ? `<p style="margin:24px 0 0;font-size:13px;color:#555">${escapeHtml(block.footer)}</p>` : ''
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;max-width:560px">${paragraphs}${button}${details}${footer}<p style="margin:24px 0 0;color:${ACCENT};font-weight:600">${BRAND}</p></div>`
  return { text, html }
}

export type PasswordLinkInput =
  | { readonly kind: 'invite'; readonly name: string; readonly roleLabel: string; readonly link: string; readonly validHours: number }
  | { readonly kind: 'admin_reset' | 'forgot'; readonly name: string; readonly link: string; readonly validHours: number }

/** Staff: a new account (invite), a reset by an admin, or "Forgot password?" on the sign-in page. */
export function passwordLinkEmail(input: PasswordLinkInput): Content {
  const valid = `The link works once and expires in ${hours(input.validHours)}.`
  if (input.kind === 'invite') {
    return {
      subject: `Your ${BRAND} account: set your password`,
      ...render({
        paragraphs: [`Hello ${input.name},`, `An account has been created for you on ${BRAND}, the VIP guest coordination system, with the role ${input.roleLabel}. Choose your password to start.`, valid],
        button: { label: 'Set your password', href: input.link },
        footer: 'If you were not expecting this, you can ignore this email.',
      }),
    }
  }
  if (input.kind === 'admin_reset') {
    return {
      subject: `Set a new ${BRAND} password`,
      ...render({
        paragraphs: [`Hello ${input.name},`, `An administrator reset your password, and you were signed out on every device. Choose a new one to sign in again.`, valid],
        button: { label: 'Choose a new password', href: input.link },
      }),
    }
  }
  return {
    subject: `Reset your ${BRAND} password`,
    ...render({
      paragraphs: [`Hello ${input.name},`, 'Someone asked to reset the password of your account. Choose a new one with the link below.', valid],
      button: { label: 'Choose a new password', href: input.link },
      footer: 'If you did not ask for this, ignore this email: your password stays the same.',
    }),
  }
}

export interface RegistrationReceivedInput {
  readonly guest: string
  readonly eventName: string
  readonly venueName: string
  readonly referenceCode: string
  /** Something needs checking: the organisers may get in touch. */
  readonly followUp: boolean
  readonly arrivalDate: string | null
  readonly flightNumber: string | null
}

/** Guests: confirmation sent to the contact email given on the public registration form. */
export function registrationReceivedEmail(input: RegistrationReceivedInput): Content {
  const details: Array<readonly [string, string]> = [
    ['Reference', input.referenceCode],
    ['Guest', input.guest],
    ['Event', input.eventName],
    ['Venue', input.venueName],
  ]
  if (input.arrivalDate) details.push(['Arrival date', input.arrivalDate])
  if (input.flightNumber) details.push(['Flight', input.flightNumber])
  return {
    subject: `Registration received: ${input.eventName} (${input.referenceCode})`,
    ...render({
      paragraphs: [
        'Hello,',
        `Thank you: the organisers of ${input.eventName} have received the registration for ${input.guest}. Keep your reference in case you need to contact them.`,
        ...(input.followUp ? ['Some details need checking, so the organisers may contact you before confirming.'] : []),
      ],
      details,
      footer: 'If you did not register for this event, please tell the organisers.',
    }),
  }
}

export interface DemoRequestEmailInput {
  readonly name: string
  readonly organisation: string
  readonly email: string
  readonly eventSizeLabel?: string
  readonly message?: string
}

/** To the Hostmark team: someone asked for a demo on the landing page. Reply goes to them. */
export function demoRequestEmail(input: DemoRequestEmailInput): Content {
  const details: ReadonlyArray<readonly [string, string]> = [
    ['Name', input.name],
    ['Organisation', input.organisation],
    ['Email', input.email],
    ...(input.eventSizeLabel ? [['Event size', input.eventSizeLabel] as const] : []),
  ]
  return {
    subject: `Demo request from ${input.organisation}`,
    ...render({
      paragraphs: [
        `${input.name} from ${input.organisation} asked for a demo of ${BRAND} on the website. Reply to this email to answer them.`,
        ...(input.message ? [`Message: ${input.message}`] : []),
      ],
      details,
    }),
  }
}
