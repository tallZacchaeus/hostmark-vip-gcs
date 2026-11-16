// "Request a demo" on the public landing page. One-line fields refuse line breaks so a value
// cannot reshape the email it is put into (the organisation goes into the subject).
import { z } from 'zod'
import { blankToUndefined, requiredText } from './common'

export const EVENT_SIZES = ['under_50', '50_200', '200_500', 'over_500'] as const
export type EventSize = (typeof EVENT_SIZES)[number]

export const EVENT_SIZE_LABELS: Readonly<Record<EventSize, string>> = {
  under_50: 'Under 50 guests',
  '50_200': '50 to 200 guests',
  '200_500': '200 to 500 guests',
  over_500: 'Over 500 guests',
}

export const MAX_DEMO_MESSAGE_LENGTH = 2000
const ONE_LINE = /^[^\r\n]*$/

const oneLine = (max: number) => requiredText(max).regex(ONE_LINE, 'Keep this on one line')

export const demoRequestSchema = z.object({
  name: oneLine(100),
  organisation: oneLine(150),
  email: z.string().trim().max(200).pipe(z.email('Enter a valid email address')),
  event_size: z.preprocess(blankToUndefined, z.enum(EVENT_SIZES).optional()),
  message: z.preprocess(blankToUndefined, z.string().trim().max(MAX_DEMO_MESSAGE_LENGTH, `At most ${MAX_DEMO_MESSAGE_LENGTH} characters`).optional()),
  /** Honeypot: hidden from people, so only bots fill it in. */
  website: z.string().max(200).default(''),
})

export type DemoRequestInput = z.output<typeof demoRequestSchema>
