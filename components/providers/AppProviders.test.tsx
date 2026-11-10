import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import useSWR from 'swr'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useToast } from '@/components/ui/Toast'
import { mockApi } from '@/tests/support/api-mock'
import { AppProviders } from './AppProviders'

// Fetches with the app's default fetcher (no fetcher passed), like every screen does.
function Loader({ path }: { readonly path: string }) {
  const { data, error } = useSWR<{ data: { name: string } }>(path)
  if (error) return <p>Failed</p>
  return <p>{data ? data.data.name : 'Loading'}</p>
}

function Toaster() {
  const toast = useToast()
  return (
    <button type="button" onClick={() => toast.show({ message: 'Saved.' })}>
      Save
    </button>
  )
}

function stubLocation() {
  const assign = vi.fn()
  vi.stubGlobal('location', { ...window.location, assign })
  return assign
}

describe('AppProviders', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads API data through the envelope-aware fetcher', async () => {
    mockApi([{ path: '/api/me/event', body: { name: 'Lagos Leadership Summit 2026' } }])
    render(
      <AppProviders>
        <Loader path="/api/me/event" />
      </AppProviders>,
    )
    expect(await screen.findByText('Lagos Leadership Summit 2026')).toBeInTheDocument()
  })

  it('provides toasts to every screen', async () => {
    render(
      <AppProviders>
        <Toaster />
      </AppProviders>,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('status')).toHaveTextContent('Saved.')
  })

  it.each([
    ['unauthenticated', '/sign-in'],
    ['account_inactive', '/sign-in?reason=inactive'],
    ['password_change_required', '/account/password'],
  ])('sends the person to the right page when the session says %s', async (code, destination) => {
    const assign = stubLocation()
    mockApi([{ path: `/api/session-${code}`, body: { code, message: 'Session problem' }, status: 401 }])
    render(
      <AppProviders>
        <Loader path={`/api/session-${code}`} />
      </AppProviders>,
    )
    expect(await screen.findByText('Failed')).toBeInTheDocument()
    expect(assign).toHaveBeenCalledWith(destination)
  })

  it('stays on the page for other failures', async () => {
    const assign = stubLocation()
    mockApi([{ path: '/api/forbidden-thing', body: { code: 'forbidden', message: 'Not allowed' }, status: 403 }])
    render(
      <AppProviders>
        <Loader path="/api/forbidden-thing" />
      </AppProviders>,
    )
    expect(await screen.findByText('Failed')).toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
  })

  it('ignores errors that do not come from the API', async () => {
    const assign = stubLocation()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })),
    )
    render(
      <AppProviders>
        <Loader path="/api/broken-proxy" />
      </AppProviders>,
    )
    expect(await screen.findByText('Failed')).toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
  })
})
