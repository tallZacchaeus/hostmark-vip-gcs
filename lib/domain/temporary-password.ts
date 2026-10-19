// Temporary passwords for admin-created accounts (FR-PL-01). They satisfy the auth policy
// (10+ characters with lower, upper and digits) and avoid look-alike characters, because an
// admin usually reads them out or types them into a message.
import { randomInt } from 'node:crypto'

const LOWER = 'abcdefghijkmnpqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const ALL = LOWER + UPPER + DIGITS

export const TEMPORARY_PASSWORD_LENGTH = 14

/** Returns an integer in [0, max). Defaults to the CSPRNG; injectable for tests. */
export type RandomInt = (max: number) => number

function shuffled<T>(items: readonly T[], random: RandomInt): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapWith = random(index + 1)
    const current = copy[index] as T
    copy[index] = copy[swapWith] as T
    copy[swapWith] = current
  }
  return copy
}

export function generateTemporaryPassword(random: RandomInt = (max) => randomInt(max)): string {
  const pick = (alphabet: string): string => alphabet.charAt(random(alphabet.length))
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS)]
  const rest = Array.from({ length: TEMPORARY_PASSWORD_LENGTH - required.length }, () => pick(ALL))
  return shuffled([...required, ...rest], random).join('')
}
