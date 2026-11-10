// Link a submission to an existing delegation (FR-IN-08, F3). Nothing is merged automatically: the
// submission is recorded as a duplicate, and only the details the reviewer ticks (`apply`) are copied.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { linkSubmission } from '@/lib/services/intake/review'
import { idParamsSchema } from '@/lib/validation/common'
import { linkSubmissionSchema } from '@/lib/validation/intake'

export const POST = defineRoute(
  { roles: COORDINATOR_PLUS, params: idParamsSchema, body: linkSubmissionSchema },
  async ({ db, actor, params, body }) => jsonOk(await linkSubmission(db, actor, params.id, body.delegation_id, body.note ?? null, body.apply)),
)
