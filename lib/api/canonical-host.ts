// Sign-in only works on the address Better Auth trusts (BETTER_AUTH_URL), but Vercel also serves
// production on other addresses (the team alias, each deployment's own URL). The proxy sends
// people who land on one of those to the main address, instead of letting a correct password fail.

/** The main-address URL for this request, or null to carry on. Vercel production only. */
export function canonicalRedirectUrl(
  requestUrl: string,
  requestHost: string | null,
  canonicalUrl: string | undefined,
  vercelEnv: string | undefined,
): string | null {
  if (vercelEnv !== 'production' || !canonicalUrl || !requestHost) return null
  try {
    const canonical = new URL(canonicalUrl)
    if (requestHost === canonical.host) return null
    const { pathname, search } = new URL(requestUrl)
    return new URL(`${pathname}${search}`, canonical).toString()
  } catch {
    // Invalid configuration is rejected at startup (instrumentation.ts).
    return null
  }
}
