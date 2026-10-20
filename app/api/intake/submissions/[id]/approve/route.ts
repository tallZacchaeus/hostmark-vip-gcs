// Approve a submission (FR-IN-10): creates the delegation, guests, arrival, flight and pickup.
// Also "Treat as new" for a likely duplicate. Refused while required fields are missing.
import { getIntakeReader } from '@/lib/ai/intake-reader'
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { approveSubmission } from '@/lib/services/intake/review'
import { idParamsSchema } from '@/lib/validation/common'
import { approveSubmissionSchema } from '@/lib/validation/intake'

export const POST = defineRoute(
  { roles: COORDINATOR_PLUS, params: idParamsSchema, body: approveSubmissionSchema },
  async ({ db, actor, params, body }) => jsonOk(await approveSubmission(db, actor, params.id, body, await getIntakeReader()), { status: 201 }),
)
