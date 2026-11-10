import { render } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TurnstileWidget } from './TurnstileWidget'

// next/script loads Cloudflare's script for real; here it reports "ready" straight away.
vi.mock('next/script', () => ({
  default: function ScriptStub({ src, onReady }: { readonly src: string; readonly onReady?: () => void }) {
    useEffect(() => onReady?.(), [onReady])
    return <span data-src={src} />
  },
}))

interface RenderOptions {
  readonly sitekey: string
  readonly callback: (token: string) => void
  readonly 'expired-callback': () => void
  readonly 'error-callback': () => void
}

function installTurnstile() {
  const render = vi.fn((_element: HTMLElement, _options: RenderOptions) => 'widget-1')
  const remove = vi.fn()
  window.turnstile = { render: render as never, remove }
  return { render, remove, options: () => render.mock.calls[0]?.[1] as RenderOptions }
}

describe('TurnstileWidget', () => {
  afterEach(() => {
    delete window.turnstile
  })

  it('renders the check with the site key and passes tokens on, clearing them when they expire or fail', () => {
    const turnstile = installTurnstile()
    const onToken = vi.fn()
    const { container, unmount } = render(<TurnstileWidget siteKey="site-key-1" onToken={onToken} />)

    expect(container.querySelector('[data-src]')?.getAttribute('data-src')).toContain('challenges.cloudflare.com/turnstile')
    expect(turnstile.render).toHaveBeenCalledTimes(1)
    expect(turnstile.options().sitekey).toBe('site-key-1')

    turnstile.options().callback('token-abc')
    expect(onToken).toHaveBeenLastCalledWith('token-abc')
    turnstile.options()['expired-callback']()
    expect(onToken).toHaveBeenLastCalledWith(null)
    turnstile.options()['error-callback']()
    expect(onToken).toHaveBeenCalledTimes(3)

    unmount()
    expect(turnstile.remove).toHaveBeenCalledWith('widget-1')
  })

  it('waits quietly when the Turnstile script is not available', () => {
    const onToken = vi.fn()
    const { container } = render(<TurnstileWidget siteKey="site-key-1" onToken={onToken} />)
    expect(container.querySelector('.turnstile-box')).toBeInTheDocument()
    expect(onToken).not.toHaveBeenCalled()
  })
})
