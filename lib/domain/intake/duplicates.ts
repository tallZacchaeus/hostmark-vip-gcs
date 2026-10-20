// Duplicate classification (FR-IN-08). The database finds candidates by trigram name similarity;
// this decides: exact (same person, arrival, contact, party size and departure, and no new note →
// linked automatically and logged), likely (similar name and the same date, flight or contact, or
// an exact match that brings new information → review), or none.
// Nothing is ever merged automatically.
import { type NormalizedIntake, displayName } from './normalize'

export type DuplicateKind = 'none' | 'exact' | 'likely'

export const LIKELY_NAME_SIMILARITY = 0.6

export interface DuplicateCandidate {
  readonly delegation_id: string
  readonly principal_name: string
  readonly similarity: number
  readonly flight_number: string | null
  readonly arrival_date: string | null
  readonly contact_email: string | null
  readonly contact_phone: string | null
  /** Companions on the existing delegation (excluding the principal). */
  readonly party_size: number
  readonly departure_date: string | null
}

export interface DuplicateResult {
  readonly kind: DuplicateKind
  readonly delegation_id: string | null
}

const key = (value: string): string => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

function sameName(intake: NormalizedIntake, candidate: DuplicateCandidate): boolean {
  const wanted = key(candidate.principal_name)
  return wanted === key(intake.full_name) || wanted === key(displayName(intake))
}

const MIN_NAME_WORD = 3
const nameWords = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= MIN_NAME_WORD)

/** "Okafor" within "Augustine Okafor": forwarded messages often give only part of a name. */
function partOfName(intake: NormalizedIntake, candidate: DuplicateCandidate): boolean {
  const incoming = nameWords(intake.full_name)
  const existing = new Set(nameWords(candidate.principal_name))
  return incoming.length > 0 && incoming.every((word) => existing.has(word))
}

function sameArrival(intake: NormalizedIntake, candidate: DuplicateCandidate): boolean {
  if (intake.arrival_date !== candidate.arrival_date) return false
  return (intake.flight_number ?? null) === (candidate.flight_number ?? null)
}

function sameContact(intake: NormalizedIntake, candidate: DuplicateCandidate): boolean {
  return (
    (intake.contact_email !== null && intake.contact_email === candidate.contact_email) ||
    (intake.contact_phone !== null && intake.contact_phone === candidate.contact_phone)
  )
}

/** A resubmission that changes nothing: anything new (party, departure, a note) needs a person. */
function nothingNew(intake: NormalizedIntake, candidate: DuplicateCandidate): boolean {
  return intake.others === '' && intake.party.length === candidate.party_size && intake.departure_date === candidate.departure_date
}

export function classifyDuplicate(intake: NormalizedIntake, candidates: readonly DuplicateCandidate[]): DuplicateResult {
  const exact = candidates.find(
    (candidate) => sameName(intake, candidate) && sameArrival(intake, candidate) && sameContact(intake, candidate) && nothingNew(intake, candidate),
  )
  if (exact) return { kind: 'exact', delegation_id: exact.delegation_id }

  const likely = [...candidates]
    .sort((a, b) => b.similarity - a.similarity)
    .find((candidate) => {
      const similar = candidate.similarity >= LIKELY_NAME_SIMILARITY || sameName(intake, candidate) || partOfName(intake, candidate)
      const sameDate = intake.arrival_date !== null && intake.arrival_date === candidate.arrival_date
      const sameFlight = intake.flight_number !== null && intake.flight_number === candidate.flight_number
      return similar && (sameDate || sameFlight || sameContact(intake, candidate))
    })
  return likely ? { kind: 'likely', delegation_id: likely.delegation_id } : { kind: 'none', delegation_id: null }
}

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const REFERENCE_LENGTH = 4

/** "VIP-7K3Q": short, read aloud easily (no 0/O or 1/I). */
export function newReferenceCode(random: (size: number) => Uint8Array = (size) => crypto.getRandomValues(new Uint8Array(size))): string {
  const bytes = random(REFERENCE_LENGTH)
  const code = Array.from(bytes, (byte) => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]).join('')
  return `VIP-${code}`
}
