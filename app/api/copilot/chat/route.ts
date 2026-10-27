// Ask the Co-Pilot (FR-CP-01…06): coordinators and above. The answer comes from typed tools run as
// the signed-in user; a requested change comes back as a proposal to approve, never applied here.
import { jsonOk } from '@/lib/api/response'
import { defineRoute } from '@/lib/api/route'
import { COORDINATOR_PLUS } from '@/lib/auth/roles'
import { answerQuestion } from '@/lib/copilot/engine'
import { systemClock } from '@/lib/domain/clock'
import { copilotQuestionSchema } from '@/lib/validation/copilot'

export const POST = defineRoute({ roles: COORDINATOR_PLUS, body: copilotQuestionSchema }, async ({ body, asActor }) => {
  const question = {
    message: body.message,
    conversation_id: body.conversation_id ?? crypto.randomUUID(),
    input_mode: body.input_mode,
    transcript_original: body.input_mode === 'voice' ? (body.transcript_original ?? null) : null,
  }
  return jsonOk(await asActor((tx) => answerQuestion(tx, question, systemClock.now())))
})
