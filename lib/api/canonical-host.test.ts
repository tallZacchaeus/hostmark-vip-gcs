import { describe, expect, it } from 'vitest'
import { canonicalRedirectUrl } from './canonical-host'

const MAIN = 'https://hostmark-vip.vercel.app'
const OTHER = 'hostmark-vip-team.vercel.app'

describe('canonicalRedirectUrl', () => {
  it('sends a production request on another address to the main one, keeping path and query', () => {
    expect(canonicalRedirectUrl(`https://${OTHER}/sign-in?reason=expired`, OTHER, MAIN, 'production')).toBe(`${MAIN}/sign-in?reason=expired`)
  })

  it('leaves the main address alone', () => {
    expect(canonicalRedirectUrl(`${MAIN}/sign-in`, 'hostmark-vip.vercel.app', MAIN, 'production')).toBeNull()
  })

  it('applies to Vercel production only, so previews and local builds keep working', () => {
    expect(canonicalRedirectUrl(`https://${OTHER}/sign-in`, OTHER, MAIN, 'preview')).toBeNull()
    expect(canonicalRedirectUrl('http://localhost:3100/sign-in', 'localhost:3100', 'http://localhost:3000', undefined)).toBeNull()
  })

  it('does nothing without usable configuration', () => {
    expect(canonicalRedirectUrl(`https://${OTHER}/sign-in`, OTHER, undefined, 'production')).toBeNull()
    expect(canonicalRedirectUrl(`https://${OTHER}/sign-in`, OTHER, 'not a url', 'production')).toBeNull()
    expect(canonicalRedirectUrl(`https://${OTHER}/sign-in`, null, MAIN, 'production')).toBeNull()
  })
})
