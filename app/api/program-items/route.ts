// Add a programme item (FR-PG-01): programs team and Admin.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { PROGRAM_EDITORS } from '@/lib/auth/roles'
import { createProgramItem } from '@/lib/services/programme'
import { programItemSchema } from '@/lib/validation/programme'

export const POST = defineRoute({ roles: PROGRAM_EDITORS, body: programItemSchema }, async ({ body, asActor }) => {
  return jsonOk(await asActor((tx) => createProgramItem(tx, body)), { status: 201 })
})
