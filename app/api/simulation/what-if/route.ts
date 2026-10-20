// What-if preview (Figma simulation screen): what a flight delay or a driver dropping out would
// change, computed by the live planner and never written anywhere.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { previewWhatIf } from '@/lib/services/simulation/what-if'
import { whatIfSchema } from '@/lib/validation/transport'

export const POST = defineRoute({ roles: COORDINATOR_PLUS, body: whatIfSchema }, async ({ body, asActor }) => {
  return jsonOk(await asActor((tx) => previewWhatIf(tx, body)))
})
