// Edit or delete a programme item (FR-PG-01). Publishing and cancelling are edits of `status`.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { PROGRAM_EDITORS } from '@/lib/auth/roles'
import { deleteProgramItem, updateProgramItem } from '@/lib/services/programme'
import { idParamsSchema } from '@/lib/validation/common'
import { programItemSchema } from '@/lib/validation/programme'

export const PATCH = defineRoute({ roles: PROGRAM_EDITORS, params: idParamsSchema, body: programItemSchema }, async ({ params, body, asActor }) => {
  return jsonOk(await asActor((tx) => updateProgramItem(tx, params.id, body)))
})

export const DELETE = defineRoute({ roles: PROGRAM_EDITORS, params: idParamsSchema }, async ({ params, asActor }) => {
  await asActor((tx) => deleteProgramItem(tx, params.id))
  return jsonOk({ id: params.id })
})
