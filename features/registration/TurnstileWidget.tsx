'use client'
// Cloudflare Turnstile (FR-IN-02), rendered only when a site key is configured. The token is
// verified on the server; it expires, so the widget reports null when it does.
import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string
  remove(widgetId: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

interface TurnstileWidgetProps {
  readonly siteKey: string
  /** Called with a fresh token, or null when it expires or the check fails. Keep it stable. */
  readonly onToken: (token: string | null) => void
}

export function TurnstileWidget({ siteKey, onToken }: TurnstileWidgetProps) {
  const box = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const api = window.turnstile
    if (!ready || !api || !box.current) return
    const widgetId = api.render(box.current, {
      sitekey: siteKey,
      callback: (token: string) => onToken(token),
      'expired-callback': () => onToken(null),
      'error-callback': () => onToken(null),
    })
    return () => api.remove(widgetId)
  }, [ready, siteKey, onToken])

  return (
    <>
      <Script src={SCRIPT_URL} strategy="afterInteractive" onReady={() => setReady(true)} />
      <div ref={box} className="turnstile-box" />
    </>
  )
}
