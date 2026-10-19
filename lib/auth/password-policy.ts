// Password rules shared by Better Auth's config, request validation and temporary passwords.
// Matches docs/02-TRD.md (10+ characters with lower case, upper case and a digit).
import { z } from 'zod'

export const MIN_PASSWORD_LENGTH = 10
export const MAX_PASSWORD_LENGTH = 128

export const newPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH, `Use at most ${MAX_PASSWORD_LENGTH} characters`)
  .regex(/[a-z]/, 'Include a lower-case letter')
  .regex(/[A-Z]/, 'Include an upper-case letter')
  .regex(/[0-9]/, 'Include a digit')
