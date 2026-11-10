// Content-Security-Policy for every page (set by proxy.ts, with a fresh nonce per request). Next.js
// reads the nonce from the request's policy and puts it on its own inline scripts, so no inline
// script without it can run; 'strict-dynamic' lets those scripts load the app's chunks (and the
// Turnstile script when it is on). Styles stay 'unsafe-inline': React style attributes need it.

export interface CspOptions {
  /** The development server evaluates code for hot reloading. */
  readonly development: boolean
}

const TURNSTILE = 'https://challenges.cloudflare.com'

export function contentSecurityPolicy(nonce: string, { development }: CspOptions): string {
  const scripts = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(development ? ["'unsafe-eval'"] : [])]
  return [
    "default-src 'self'",
    `script-src ${scripts.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    `frame-src ${TURNSTILE}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

/** 128 random bits, base64: a new one for every page request. */
export function newNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
}
