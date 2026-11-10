'use client'
// "Forgot password?" and emailed set-password links, through Better Auth's allowlisted endpoints
// (lib/auth/public-paths.ts). The request answers the same whether or not the address exists.
import { ApiClientError } from './api'

const OFFLINE = 'Could not reach the server. Check your connection and try again.'
const LINK_INVALID = 'This link has expired or was already used. Ask for a new one.'
const UNAVAILABLE = 'This is not working right now. Try again in a moment.'

async function post(path: string, body: object): Promise<Response> {
  try {
    return await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiClientError(0, 'offline', OFFLINE)
  }
}

function rateLimited(): ApiClientError {
  return new ApiClientError(429, 'rate_limited', 'Too many attempts. Wait a minute and try again.')
}

export async function requestPasswordLink(email: string): Promise<void> {
  const response = await post('/api/auth/request-password-reset', { email: email.trim() })
  if (response.status === 429) throw rateLimited()
  if (!response.ok) throw new ApiClientError(response.status, 'request_failed', UNAVAILABLE)
}

export async function setPasswordWithLink(token: string, newPassword: string): Promise<void> {
  const response = await post('/api/auth/reset-password', { token, newPassword })
  if (response.status === 429) throw rateLimited()
  if (response.ok) return
  const body = (await response.json().catch(() => null)) as { code?: string } | null
  if (body?.code?.toUpperCase().includes('TOKEN')) throw new ApiClientError(response.status, 'link_invalid', LINK_INVALID)
  throw new ApiClientError(response.status, 'reset_failed', UNAVAILABLE)
}
