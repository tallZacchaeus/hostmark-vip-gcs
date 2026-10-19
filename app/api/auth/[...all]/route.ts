// Better Auth over HTTP, restricted to the allowlist in lib/auth/public-paths.ts.
// Sign in: POST /api/auth/sign-in/email { email, password } → session cookie, plus a
// `set-auth-token` header for clients that use `Authorization: Bearer <token>`.
import { jsonError } from '@/lib/api/response'
import { getAuth } from '@/lib/auth/auth'
import { authPathFromUrl, isPublicAuthPath } from '@/lib/auth/public-paths'

async function handle(request: Request): Promise<Response> {
  const path = authPathFromUrl(request.url)
  if (!path || !isPublicAuthPath(path)) {
    return jsonError(404, { code: 'not_found', message: 'Not found' })
  }
  return getAuth().handler(request)
}

export const GET = handle
export const POST = handle
