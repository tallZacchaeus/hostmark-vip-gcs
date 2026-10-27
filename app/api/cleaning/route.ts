// The cleaning queue in working order with live ready estimates, and today's cleaned rooms
// (FR-CL-03/04). Rooms only, never guest identities.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { CLEANING_READERS } from '@/lib/auth/roles'
import { systemClock } from '@/lib/domain/clock'
import { loadCleaning } from '@/lib/repositories/cleaning'

export const GET = defineRoute({ roles: CLEANING_READERS }, async ({ asActor }) => {
  return jsonOk(await asActor((tx) => loadCleaning(tx, systemClock.now())))
})
