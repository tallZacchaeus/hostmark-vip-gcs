// Server configuration, validated once at startup (instrumentation.ts) and on first use.
// Error messages name the offending variable but never echo its value.
import 'server-only'
import { z } from 'zod'

const MIN_SECRET_LENGTH = 32

export function parseOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map((entry) => {
      let origin: string
      try {
        origin = new URL(entry).origin
      } catch {
        throw new Error(`"${entry}" is not a valid origin (expected e.g. https://ops.example.com)`)
      }
      if (origin !== entry) {
        throw new Error(`"${entry}" is not a bare origin (no path or trailing slash)`)
      }
      return origin
    })
}

const PGLITE_URL = /^pglite:\/\//
/** postgres://… everywhere; pglite://<dir> (in-process database) only outside production. */
const databaseUrl = z
  .string()
  .regex(/^(postgres(ql)?|pglite):\/\//, 'must be a postgres:// connection URL (or pglite://<dir> in development)')

/** An optional key: blank means "not configured". */
const optionalSecret = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((value) => (value ? value : undefined))

/** A setting that may be left blank: blank means "not configured". */
const blankAsUndefined = (value: unknown): unknown => (typeof value === 'string' && value.trim() === '' ? undefined : value)

const serverEnvSchema = z.object({
  DATABASE_URL: databaseUrl,
  /**
   * The real-time LISTEN connection, when DATABASE_URL goes through a transaction-mode pooler
   * (Supabase port 6543), which cannot hold a LISTEN. Unset: DATABASE_URL.
   */
  DATABASE_LISTEN_URL: z.preprocess(blankAsUndefined, databaseUrl.optional()),
  /** vip_service login: Better Auth's own queries (the only credential that can act as vip_system). */
  SERVICE_DATABASE_URL: databaseUrl,
  BETTER_AUTH_SECRET: z.string().min(MIN_SECRET_LENGTH, `must be at least ${MIN_SECRET_LENGTH} characters`),
  BETTER_AUTH_URL: z.url('must be the app URL, e.g. https://ops.example.com'),
  API_ALLOWED_ORIGINS: z.string().default('').transform(parseOrigins),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Opt-in for a local production build (`next start`, end-to-end tests) on PGlite. Never on the droplet. */
  ALLOW_PGLITE: z.enum(['true', 'false']).default('false'),
  /** Claude API key. Unset: free text is read by the offline rules instead (no external calls). */
  ANTHROPIC_API_KEY: optionalSecret,
  INTAKE_AI_MODEL: z.string().trim().min(1).max(100).default('claude-opus-5-5'),
  /** Cloudflare Turnstile. Unset: the bot check is skipped and only rate limiting protects the form. */
  TURNSTILE_SITE_KEY: optionalSecret,
  TURNSTILE_SECRET_KEY: optionalSecret,
  /** AeroDataBox (RapidAPI) key for live flight status. Unset: live mode leaves flights as they are. */
  AERODATABOX_API_KEY: optionalSecret,
  /** Live flight-status calls allowed per day (TRD §9: Pro is 5,000 units a month). */
  FLIGHT_POLL_DAILY_LIMIT: z.coerce.number().int().min(1).max(100_000).default(160),
  /**
   * in-process: the app server runs the background worker; off: run `pnpm worker` beside it, or
   * (on Vercel, where no process stays running) have a scheduler call /api/internal/worker-tick.
   */
  WORKER_MODE: z.enum(['in-process', 'off']).default('in-process'),
  /** Resend API key for outgoing email. Unset: no email is sent (temporary passwords on screen). */
  RESEND_API_KEY: optionalSecret,
  /** Sender for email, e.g. "Hostmark <noreply@hostmark.tech>"; required with RESEND_API_KEY. */
  MAIL_FROM: z.preprocess(
    blankAsUndefined,
    z
      .string()
      .trim()
      .max(200)
      .regex(/^([^<>]+<[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>|[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+)$/, 'must be an address, e.g. Hostmark <noreply@example.com>')
      .optional(),
  ),
  /** Where "Request a demo" on the landing page is emailed. Unset: the form says requests are not open. */
  DEMO_REQUEST_TO: z.preprocess(blankAsUndefined, z.string().trim().max(200).pipe(z.email('must be an email address')).optional()),
  /** Bearer secret for /api/internal/worker-tick. Unset: that route does not exist. */
  CRON_SECRET: z.preprocess(
    blankAsUndefined,
    z.string().trim().min(MIN_SECRET_LENGTH, `must be at least ${MIN_SECRET_LENGTH} characters`).max(500).optional(),
  ),
}).superRefine((env, context) => {
  if (env.RESEND_API_KEY && !env.MAIL_FROM) {
    context.addIssue({ code: 'custom', path: ['MAIL_FROM'], message: 'is required when RESEND_API_KEY is set' })
  }
  if (env.NODE_ENV !== 'production' || env.ALLOW_PGLITE === 'true') return
  for (const key of ['DATABASE_URL', 'SERVICE_DATABASE_URL'] as const) {
    if (PGLITE_URL.test(env[key])) {
      context.addIssue({ code: 'custom', path: [key], message: 'must not use pglite:// in production' })
    }
  }
})

export type ServerEnv = z.output<typeof serverEnvSchema>

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source)
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`)
    throw new Error(`Invalid server configuration: ${problems.join('; ')}`)
  }
  return result.data
}

let cached: ServerEnv | undefined

export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env)
  return cached
}
