// The Co-Pilot (FR-CP-01…06): one question → understood (offline rules, lib/domain/copilot/intent.ts)
// → one typed tool run as the signed-in user → a short answer with citations, or a proposal to
// approve. Every exchange is logged in copilot_exchanges. The engine sits behind `answerQuestion`, so
// a Claude tool-runner engine can replace the rules later without changing the route or the screen.
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'
import { type Intent, type ToolName, parseIntent } from '@/lib/domain/copilot/intent'
import { getCleaningQueue, getPendingDecisions, getProgram, listPickups, listRooms } from './board-tools'
import { findArrivals, getFlightStatus, getGuest, whoIsAffected } from './read-tools'
import { type Citation, type ToolAnswer, type ToolContext, citeOnce } from './text'
import { loadVocabulary } from './vocabulary'
import { type ProposalCard, proposeDriverAssignment, proposeNote, proposeRoomMove } from './write-tools'

export const ENGINE = 'rules'

export interface CopilotQuestion {
  readonly message: string
  readonly conversation_id: string
  readonly input_mode: 'text' | 'voice'
  readonly transcript_original: string | null
}

export interface CopilotReply {
  readonly conversation_id: string
  readonly intent: ToolName
  readonly answer: string
  readonly citations: Citation[]
  readonly proposal: ProposalCard | null
  readonly latency_ms: number
}

const HELP_TEXT =
  'I can answer questions about arrivals (“Who lands in the next 2 hours?”, “Which arrivals have no driver?”), a guest (“Where is Bishop Okafor staying?”), a flight (“Is ET512 delayed?”, “Who is affected by ET512?”), pickups, free rooms, the cleaning queue, the programme and decisions waiting for you. I can also prepare changes for your approval: “Move Dr Eze to room 305”, “Assign Emeka to Moyo’s pickup”, “Add a note to Dr Eze: allergic to peanuts”.'

const CLARIFY_TEXT: Readonly<Record<string, (options: string[]) => string>> = {
  unknown_guest: () => 'I could not tell which guest you mean. Try their full name.',
  ambiguous_guest: (options) => `Which guest do you mean: ${options.join(' or ')}?`,
  unknown_room: () => 'I could not find that room. Give the room number, for example “room 305”.',
  unknown_driver: (options) => `Which driver? Active drivers: ${options.join(', ') || 'none'}.`,
  empty_note: () => 'What should the note say? For example: “Add a note to Dr Eze: allergic to peanuts”.',
}

async function runTool(tx: Tx, intent: Intent, context: ToolContext): Promise<ToolAnswer & { proposal?: ProposalCard | null }> {
  switch (intent.tool) {
    case 'find_arrivals':
      return findArrivals(tx, intent.args, context)
    case 'get_guest':
      return getGuest(tx, intent.args, context)
    case 'get_flight_status':
      return getFlightStatus(tx, intent.args, context)
    case 'who_is_affected':
      return whoIsAffected(tx, intent.args, context)
    case 'list_pickups':
      return listPickups(tx, intent.args, context)
    case 'list_rooms':
      return listRooms(tx, intent.args)
    case 'get_cleaning_queue':
      return getCleaningQueue(tx, context)
    case 'get_program':
      return getProgram(tx, intent.args, context)
    case 'get_pending_decisions':
      return getPendingDecisions(tx)
    case 'propose_room_move':
      return proposeRoomMove(tx, intent.args, context)
    case 'propose_driver_assignment':
      return proposeDriverAssignment(tx, intent.args, context)
    case 'add_note':
      return proposeNote(tx, intent.args)
    case 'clarify':
      return { answer: (CLARIFY_TEXT[intent.args.reason] ?? CLARIFY_TEXT.unknown_guest)?.(intent.args.options) ?? '', citations: [] }
    default:
      return { answer: HELP_TEXT, citations: [] }
  }
}

async function eventTimezone(tx: Tx): Promise<string> {
  const { rows } = await sql<{ timezone: string }>`select timezone from public.events limit 1`.execute(tx)
  return rows[0]?.timezone ?? 'UTC'
}

/** Understands, answers and logs one question. Runs as the signed-in coordinator (RLS). */
export async function answerQuestion(tx: Tx, question: CopilotQuestion, now: Date): Promise<CopilotReply> {
  const started = performance.now()
  const context: ToolContext = { now, timezone: await eventTimezone(tx) }
  const intent = parseIntent(question.message, await loadVocabulary(tx))
  const result = await runTool(tx, intent, context)
  const reply: CopilotReply = {
    conversation_id: question.conversation_id,
    intent: intent.tool,
    answer: result.answer,
    citations: citeOnce(result.citations),
    proposal: result.proposal ?? null,
    latency_ms: Math.round(performance.now() - started),
  }
  await tx
    .insertInto('copilot_exchanges')
    .values({
      conversation_id: question.conversation_id,
      question: question.message,
      input_mode: question.input_mode,
      transcript_original: question.transcript_original,
      engine: ENGINE,
      intent: intent.tool,
      tools: JSON.stringify([{ name: intent.tool, args: intent.args }]),
      answer: reply.answer,
      citations: JSON.stringify(reply.citations),
      proposal_id: reply.proposal?.id ?? null,
      latency_ms: reply.latency_ms,
    })
    .execute()
  return reply
}
