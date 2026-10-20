// One submission (FR-IN-10): GET for the review screen (original, what was read, issues and the
// matched delegation for comparison); PATCH saves the coordinator's corrections and re-checks.
import { getIntakeReader } from '@/lib/ai/intake-reader'
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { getSubmission } from '@/lib/repositories/intake'
import { updateSubmission } from '@/lib/services/intake/review'
import { idParamsSchema } from '@/lib/validation/common'
import { submissionUpdateSchema } from '@/lib/validation/intake'

export const GET = defineRoute({ roles: COORDINATOR_PLUS, params: idParamsSchema }, async ({ params, asActor }) =>
  jsonOk(await asActor((tx) => getSubmission(tx, params.id))),
)

export const PATCH = defineRoute(
  { roles: COORDINATOR_PLUS, params: idParamsSchema, body: submissionUpdateSchema },
  async ({ db, actor, params, body }) => jsonOk(await updateSubmission(db, actor, params.id, body.fields, await getIntakeReader())),
)
