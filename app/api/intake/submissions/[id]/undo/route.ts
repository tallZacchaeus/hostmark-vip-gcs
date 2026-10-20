// Undo automatic processing (FR-IN-09): removes the delegation the submission created and puts the
// submission back in the review queue.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { undoAutoProcessing } from '@/lib/services/intake/review'
import { idParamsSchema } from '@/lib/validation/common'

export const POST = defineRoute({ roles: COORDINATOR_PLUS, params: idParamsSchema }, async ({ db, actor, params }) =>
  jsonOk(await undoAutoProcessing(db, actor, params.id)),
)
