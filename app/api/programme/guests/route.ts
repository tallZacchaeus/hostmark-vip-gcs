// Guests to choose participants from (programme editors only).
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { PROGRAM_EDITORS } from '@/lib/auth/roles'
import { loadProgrammeGuests } from '@/lib/repositories/programme'

export const GET = defineRoute({ roles: PROGRAM_EDITORS }, async ({ asActor }) => {
  return jsonOk(await asActor((tx) => loadProgrammeGuests(tx)))
})
