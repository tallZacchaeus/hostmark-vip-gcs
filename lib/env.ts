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

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection URL'),
  /** vip_service login: Better Auth's own queries (the only credential that can act as vip_system). */
  SERVICE_DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection URL'),
  BETTER_AUTH_SECRET: z.string().min(MIN_SECRET_LENGTH, `must be at least ${MIN_SECRET_LENGTH} characters`),
  BETTER_AUTH_URL: z.url('must be the app URL, e.g. https://ops.example.com'),
  API_ALLOWED_ORIGINS: z.string().default('').transform(parseOrigins),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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
