// Maps anything a route can throw to an ApiError with a safe, user-facing message.
// Messages raised by our own SQL functions carry a machine code in HINT and are shown as-is;
// any other database message stays in the server log and never reaches the client.
import { ZodError } from 'zod'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const Errors = {
  unauthenticated: (): ApiError => new ApiError(401, 'unauthenticated', 'Sign in to continue'),
  inactive: (): ApiError => new ApiError(403, 'account_inactive', 'This account has been deactivated'),
  passwordChangeRequired: (): ApiError =>
    new ApiError(403, 'password_change_required', 'Change your temporary password to continue'),
  forbidden: (message = 'You do not have permission to do that'): ApiError =>
    new ApiError(403, 'forbidden', message),
  notFound: (what = 'Record'): ApiError => new ApiError(404, 'not_found', `${what} not found`),
  badRequest: (message: string, details?: unknown): ApiError =>
    new ApiError(400, 'bad_request', message, details),
  rateLimited: (retryAfterSeconds: number): ApiError =>
    new ApiError(429, 'rate_limited', 'Too many requests, please wait and try again', { retryAfterSeconds }),
} as const

interface PgErrorLike {
  readonly code: string
  readonly message: string
  readonly hint?: string
  readonly detail?: string
  readonly constraint?: string
  readonly column?: string
}

interface AuthLibraryErrorLike {
  readonly statusCode: number
  readonly body?: { readonly code?: string; readonly message?: string }
}

const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/

const UNIQUE_MESSAGES: Readonly<Record<string, string>> = {
  rooms_number_unique: 'A room with this number already exists',
  room_types_name_unique: 'A room type with this name already exists',
  vip_categories_name_unique: 'A VIP category with this name already exists',
  vip_categories_rank_unique: 'Another VIP category already has this rank',
  profiles_email_key: 'An account with this email already exists',
  drivers_profile_id_key: 'This login is already linked to another driver',
  events_singleton: 'The event has already been set up',
  simulation_runs_one_running: 'A simulation is already running; stop it first',
}

function isPgError(error: unknown): error is PgErrorLike {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  const { code, message } = error as Record<string, unknown>
  return typeof code === 'string' && SQLSTATE_PATTERN.test(code) && typeof message === 'string'
}

function isAuthLibraryError(error: unknown): error is AuthLibraryErrorLike {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  const { statusCode, name } = error as Record<string, unknown>
  return name === 'APIError' && typeof statusCode === 'number'
}

function parseDetail(detail: string | undefined): unknown {
  if (!detail) {
    return undefined
  }
  try {
    return JSON.parse(detail) as unknown
  } catch {
    return undefined
  }
}

function fromForeignKeyViolation(error: PgErrorLike): ApiError {
  if (error.detail?.includes('is still referenced')) {
    return new ApiError(409, 'in_use', 'This record is still in use by other records')
  }
  return new ApiError(400, 'invalid_reference', 'A linked record does not exist')
}

function fromNotNullViolation(error: PgErrorLike): ApiError {
  if (error.column === 'event_id') {
    return new ApiError(409, 'event_not_found', 'Set up the event first')
  }
  return new ApiError(400, 'missing_value', 'A required value is missing', { column: error.column })
}

function fromPgError(error: PgErrorLike): ApiError {
  const ownCode = error.hint && /^[a-z_]+$/.test(error.hint) ? error.hint : undefined
  const ownDetails = ownCode ? parseDetail(error.detail) : undefined
  const pick = (status: number, fallbackCode: string, fallbackMessage: string): ApiError =>
    ownCode
      ? new ApiError(status, ownCode, error.message, ownDetails)
      : new ApiError(status, fallbackCode, fallbackMessage)

  switch (error.code) {
    case '42501':
      return pick(403, 'forbidden', 'You do not have permission to do that')
    case 'P0002':
      return pick(404, 'not_found', 'Record not found')
    case '55000':
      return pick(409, 'conflict', 'This is not possible in the current state')
    case '0A000':
      return pick(501, 'not_implemented', 'This is not available yet')
    case '23505':
      return new ApiError(
        409,
        'already_exists',
        UNIQUE_MESSAGES[error.constraint ?? ''] ?? 'A record with these details already exists',
      )
    case '23503':
      return fromForeignKeyViolation(error)
    case '23P01':
      return pick(409, 'overlap', 'This overlaps an existing record')
    case '23514':
      return ownCode
        ? pick(400, 'invalid', error.message)
        : new ApiError(400, 'invalid', 'One of the values is not allowed', { constraint: error.constraint })
    case '23502':
      return fromNotNullViolation(error)
    case '40001':
    case '40P01':
      return new ApiError(503, 'retry', 'The system is busy, please try again')
    default:
      if (error.code.startsWith('22')) {
        return pick(400, 'invalid', 'One of the values is not valid')
      }
      return new ApiError(500, 'internal_error', 'Something went wrong')
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error
  }
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    return new ApiError(400, 'validation_failed', 'Some fields are missing or invalid', details)
  }
  if (isPgError(error)) {
    return fromPgError(error)
  }
  if (isAuthLibraryError(error)) {
    const code = (error.body?.code ?? 'auth_error').toLowerCase()
    return new ApiError(error.statusCode, code, error.body?.message ?? 'Authentication failed')
  }
  return new ApiError(500, 'internal_error', 'Something went wrong')
}
