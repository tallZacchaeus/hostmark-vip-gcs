// Better Auth: email + password sign-in for admin-created staff accounts (FR-PL-01), sessions
// stored in Postgres, bearer tokens for a separately hosted frontend. Tables and columns are
// mapped onto db/migrations/20261016100100_events_profiles_auth.sql.
import 'server-only'
import { betterAuth } from 'better-auth'
import { admin, bearer } from 'better-auth/plugins'
import type { Dialect } from 'kysely'
import { getAuthDialect } from '@/lib/db/client'
import { getServerEnv } from '@/lib/env'
import { FORGOT_LINK_HOURS, completePasswordReset, sendForgotPasswordEmail } from './password-links'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './password-policy'
import { accessControl, authRoles } from './permissions'

/** A session lasts a day and is extended while it is used (at most once an hour). */
const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24
const SESSION_UPDATE_AGE_SECONDS = 60 * 60
const RATE_LIMIT_WINDOW_SECONDS = 60
const SIGN_IN_ATTEMPTS_PER_WINDOW = 5
const RESET_REQUESTS_PER_WINDOW = 3

/** ['emailVerified'] → { emailVerified: 'email_verified' } */
function snakeFields<const K extends string>(fields: readonly K[]): Record<K, string> {
  return Object.fromEntries(
    fields.map((field) => [field, field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)]),
  ) as Record<K, string>
}

export interface AuthConfig {
  readonly dialect: Dialect
  readonly secret: string
  readonly baseURL: string
  readonly trustedOrigins: readonly string[]
  readonly secureCookies: boolean
  /** Sign-in rate limiting. Always on in the app; tests that sign in many users turn it off. */
  readonly rateLimit?: boolean
}

export function createAuth(config: AuthConfig) {
  return betterAuth({
    appName: 'VIP GCS',
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: [...config.trustedOrigins],
    database: { dialect: config.dialect, type: 'postgres' },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      autoSignIn: false,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      revokeSessionsOnPasswordReset: true,
      // "Forgot password?" (only offered while email is on). Invitations and admin resets issue
      // their own longer-lived links (lib/services/accounts.ts).
      resetPasswordTokenExpiresIn: FORGOT_LINK_HOURS * 60 * 60,
      sendResetPassword: async ({ user, token }) => sendForgotPasswordEmail(user, token, config.baseURL),
      onPasswordReset: async ({ user }) => completePasswordReset(user.id),
    },
    user: {
      modelName: 'profiles',
      fields: { ...snakeFields(['emailVerified', 'createdAt', 'updatedAt']), name: 'full_name' },
      additionalFields: {
        mustChangePassword: {
          type: 'boolean',
          required: false,
          defaultValue: true,
          input: false,
          fieldName: 'must_change_password',
        },
      },
    },
    session: {
      modelName: 'auth_sessions',
      fields: snakeFields(['expiresAt', 'createdAt', 'updatedAt', 'ipAddress', 'userAgent', 'userId']),
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },
    account: {
      modelName: 'auth_accounts',
      fields: snakeFields([
        'accountId',
        'providerId',
        'userId',
        'accessToken',
        'refreshToken',
        'idToken',
        'accessTokenExpiresAt',
        'refreshTokenExpiresAt',
        'createdAt',
        'updatedAt',
      ]),
    },
    verification: {
      modelName: 'auth_verifications',
      fields: snakeFields(['expiresAt', 'createdAt', 'updatedAt']),
    },
    advanced: {
      database: { generateId: 'uuid' },
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
      useSecureCookies: config.secureCookies,
    },
    rateLimit: {
      enabled: config.rateLimit ?? true,
      window: RATE_LIMIT_WINDOW_SECONDS,
      max: 100,
      customRules: {
        '/sign-in/email': { window: RATE_LIMIT_WINDOW_SECONDS, max: SIGN_IN_ATTEMPTS_PER_WINDOW },
        // Each request can send an email: keep "Forgot password?" from being used to spam.
        '/request-password-reset': { window: RATE_LIMIT_WINDOW_SECONDS, max: RESET_REQUESTS_PER_WINDOW },
        '/reset-password': { window: RATE_LIMIT_WINDOW_SECONDS, max: SIGN_IN_ATTEMPTS_PER_WINDOW },
      },
    },
    plugins: [
      admin({
        ac: accessControl,
        roles: authRoles,
        adminRoles: ['super_admin', 'programme_manager', 'admin'],
        // Least-privileged role; our routes always set the role explicitly.
        defaultRole: 'housekeeping',
        schema: {
          user: { fields: snakeFields(['banReason', 'banExpires']) },
          session: { fields: snakeFields(['impersonatedBy']) },
        },
      }),
      bearer(),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>

let instance: Auth | undefined

export function getAuth(): Auth {
  if (!instance) {
    const env = getServerEnv()
    instance = createAuth({
      dialect: getAuthDialect(),
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
      trustedOrigins: [new URL(env.BETTER_AUTH_URL).origin, ...env.API_ALLOWED_ORIGINS],
      secureCookies: env.NODE_ENV === 'production',
    })
  }
  return instance
}

/** Tests inject an instance built on an in-process database. */
export function setAuthForTesting(replacement: Auth | undefined): void {
  instance = replacement
}
