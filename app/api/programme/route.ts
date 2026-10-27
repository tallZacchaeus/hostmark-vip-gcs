// The programme for `?day=` (default today, or the first event day): items with participants and
// risk, venues and days (FR-PG-04). Coordinators see what is published; editors see drafts too.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { PROGRAM_EDITORS, PROGRAM_READERS, hasAnyRole } from '@/lib/auth/roles'
import { systemClock } from '@/lib/domain/clock'
import { loadProgramme } from '@/lib/repositories/programme'
import { dayQuerySchema } from '@/lib/validation/transport'

export const GET = defineRoute({ roles: PROGRAM_READERS, query: dayQuerySchema }, async ({ actor, query, asActor }) => {
  const canEdit = hasAnyRole(actor.role, PROGRAM_EDITORS)
  return jsonOk(await asActor((tx) => loadProgramme(tx, query.day, systemClock.now(), canEdit)))
})
