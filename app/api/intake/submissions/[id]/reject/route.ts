// Reject a submission (FR-IN-10). It stays in the activity log; no guest is created.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { rejectSubmission } from '@/lib/services/intake/review'
import { idParamsSchema } from '@/lib/validation/common'
import { rejectSubmissionSchema } from '@/lib/validation/intake'

export const POST = defineRoute(
  { roles: COORDINATOR_PLUS, params: idParamsSchema, body: rejectSubmissionSchema },
  async ({ db, actor, params, body }) => jsonOk(await rejectSubmission(db, actor, params.id, body.note ?? null)),
)
