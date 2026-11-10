// Super Admin removal of guest personal data after the event (TRD §7 Privacy). Refused before the
// event's end date (409 event_not_ended) or without the event name as confirmation (400
// confirmation_mismatch); recorded as one "event.purge" audit entry.
import { jsonOk } from '@/lib/api/response'
import { createRateLimiter } from '@/lib/api/rate-limit'
import { defineRoute } from '@/lib/api/route'
import { purgeGuestData, purgeRequestSchema } from '@/lib/services/event-data'

const PURGES_PER_MINUTE = 5

export const POST = defineRoute(
  { roles: ['super_admin'], body: purgeRequestSchema, rateLimit: createRateLimiter({ windowMs: 60_000, max: PURGES_PER_MINUTE }) },
  async ({ body, asActor }) => jsonOk(await asActor((tx) => purgeGuestData(tx, body))),
)
