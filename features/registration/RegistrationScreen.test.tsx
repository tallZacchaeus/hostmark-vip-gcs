import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RegistrationScreen } from './RegistrationScreen'

// Cloudflare's script never loads in tests; the stub reports it ready at once.
vi.mock('next/script', () => ({
  default: function ScriptStub({ onReady }: { readonly onReady?: () => void }) {
    useEffect(() => onReady?.(), [onReady])
    return null
  },
}))

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const EVENT = { event_name: 'Lagos Leadership Summit 2026', venue_name: 'Harbour Point' }

function renderForm() {
  render(<RegistrationScreen token="abc123" event={EVENT} siteKey={null} />)
  return userEvent.setup()
}

const next = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: /^(Next|Submit registration)$/ }))

async function completeStepOne(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^Full name/), 'Augustine Okafor')
  await user.type(screen.getByLabelText(/^Contact person name/), 'Grace Adeyemi')
  await user.type(screen.getByLabelText(/^Contact email/), 'grace@example.com')
  await next(user)
}

async function completeOwnTransport(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Own transport' }))
  await user.type(screen.getByLabelText(/^Arrival date/), '2026-10-28')
  await user.type(screen.getByLabelText(/^Arrival time/), '14:30')
  await user.type(screen.getByLabelText(/^Departure date/), '2026-10-31')
  await next(user)
}

describe('RegistrationScreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    push.mockReset()
    window.sessionStorage.clear()
  })

  it('never asks the guest for a VIP category', () => {
    renderForm()
    expect(screen.queryByLabelText(/VIP category/i)).toBeNull()
    expect(screen.getByRole('heading', { name: 'Lagos Leadership Summit 2026' })).toBeInTheDocument()
  })

  it('marks every missing field on a step before moving on', async () => {
    const user = renderForm()
    await next(user)
    expect(screen.getByText('Enter the full name')).toBeInTheDocument()
    expect(screen.getByText("Enter the contact person's name")).toBeInTheDocument()
    expect(screen.getByText('Give an email address or a phone number')).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument()
  })

  it('keeps arrival and departure inside the travel dates', async () => {
    // Arrange
    render(<RegistrationScreen token="abc123" event={{ ...EVENT, travel_from: '2026-11-26', travel_to: '2026-11-30' }} siteKey={null} />)
    const user = userEvent.setup()
    await completeStepOne(user)
    await user.click(screen.getByRole('button', { name: 'Own transport' }))

    // Act
    await user.type(screen.getByLabelText(/^Arrival date/), '2026-11-20')
    await user.type(screen.getByLabelText(/^Arrival time/), '14:30')
    await user.type(screen.getByLabelText(/^Departure date/), '2026-12-02')
    await next(user)

    // Assert
    expect(screen.getByLabelText(/^Arrival date/)).toHaveAttribute('min', '2026-11-26')
    expect(screen.getByLabelText(/^Departure date/)).toHaveAttribute('max', '2026-11-30')
    expect(screen.getAllByText('Choose a date from 26 Nov to 30 Nov')).toHaveLength(2)
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument()
  })

  it('asks for the flight details only when flying', async () => {
    const user = renderForm()
    await completeStepOne(user)
    expect(screen.queryByLabelText(/^Flight number/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Flying' }))
    await next(user)
    expect(screen.getByText('Enter the flight number, for example EK783')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Own transport' }))
    await next(user)
    expect(screen.getByText('Enter the arrival time')).toBeInTheDocument()
  })

  it('requires consent, then submits the form and opens the confirmation', async () => {
    const receipt = { reference_code: 'VIP-7K3Q', follow_up: false, summary: { guest: 'Augustine Okafor', companions: 1, arrival_mode: 'own_transport', arrival_date: '2026-10-28', flight_number: null } }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: receipt, error: null }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const user = renderForm()
    await completeStepOne(user)
    await completeOwnTransport(user)
    await user.click(screen.getByRole('button', { name: 'One more guest' }))
    await user.type(within(screen.getByRole('region', { name: 'Guest 1' })).getByLabelText(/^Name/), 'Chioma Okafor')
    await next(user)

    expect(screen.getByText(/Chioma Okafor · Other/)).toBeInTheDocument()
    await next(user)
    expect(screen.getByText('Tick the box to confirm your details are correct')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('checkbox'))
    await next(user)

    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('/api/intake/abc123')
    const body = JSON.parse(String(init.body)) as { consent: boolean; form: Record<string, unknown> }
    expect(body.consent).toBe(true)
    expect(body.form).toMatchObject({ full_name: 'Augustine Okafor', arrival_mode: 'own_transport', arrival_time: '14:30' })
    expect(body.form).not.toHaveProperty('category')
    expect(push).toHaveBeenCalledWith('/register/abc123/done')
    expect(window.sessionStorage.getItem('hostmark.registration.abc123')).toContain('VIP-7K3Q')
  })

  it('takes the guest back to a field the server rejected', async () => {
    const failure = { success: false, data: null, error: { code: 'validation_failed', message: 'Some fields are missing or invalid', details: [{ path: 'form.contact_email', message: 'Enter a valid email' }] } }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(failure), { status: 400 })))
    const user = renderForm()
    await completeStepOne(user)
    await completeOwnTransport(user)
    await next(user)
    await user.click(screen.getByRole('checkbox'))
    await next(user)

    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument()
  })

  async function reachReview(user: ReturnType<typeof userEvent.setup>) {
    await completeStepOne(user)
    await completeOwnTransport(user)
    await next(user)
  }

  function respond(status: number, error: unknown) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, data: null, error }), { status })))
  }

  it.each([
    [429, { code: 'rate_limited', message: 'Slow down' }, 'Too many registrations were sent from this connection. Wait a few minutes and try again.'],
    [409, { code: 'registration_closed', message: 'Registration has just closed.' }, 'Registration has just closed.'],
    [400, { code: 'validation_failed', message: 'The form could not be read', details: [{ path: 'consent', message: 'Required' }] }, 'The form could not be read'],
  ])('keeps the answers and explains a failed send (%i)', async (status, error, message) => {
    respond(status, error)
    const user = renderForm()
    await reachReview(user)
    await user.click(screen.getByRole('checkbox'))
    await next(user)

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByText('Step 4 of 4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit registration' })).toBeEnabled()
  })

  it('says when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    const user = renderForm()
    await reachReview(user)
    await user.click(screen.getByRole('checkbox'))
    await next(user)
    expect(await screen.findByText("We couldn't reach the server. Check your connection; your answers are saved.")).toBeInTheDocument()
  })

  it('reassures the guest when the server answers with something other than the API (e.g. a proxy error page)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502 Bad Gateway</html>', { status: 502 })))
    const user = renderForm()
    await reachReview(user)
    await user.click(screen.getByRole('checkbox'))
    await next(user)
    expect(await screen.findByText("We couldn't send your registration. Your answers are saved. Try again.")).toBeInTheDocument()
  })

  it('takes the guest to the party step for a rejected companion', async () => {
    respond(400, { code: 'validation_failed', message: 'Check the party', details: [{ path: 'form.party.0.name' }] })
    const user = renderForm()
    await reachReview(user)
    await user.click(screen.getByRole('checkbox'))
    await next(user)
    expect(await screen.findByText('Step 3 of 4')).toBeInTheDocument()
  })

  it('goes back a step and can untick consent', async () => {
    const user = renderForm()
    await reachReview(user)
    const consent = screen.getByRole('checkbox')
    await user.click(consent)
    expect(consent).toHaveAttribute('aria-checked', 'true')
    await user.click(consent)
    expect(consent).toHaveAttribute('aria-checked', 'false')

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('Step 3 of 4')).toBeInTheDocument()
  })

  describe('with the bot check switched on', () => {
    afterEach(() => {
      delete window.turnstile
    })

    it('asks for the check first, then sends its token with the form', async () => {
      const widget: { solve: ((token: string) => void) | null } = { solve: null }
      window.turnstile = {
        render: (_element: HTMLElement, options: Record<string, unknown>) => {
          widget.solve = options.callback as (token: string) => void
          return 'widget-1'
        },
        remove: vi.fn(),
      }
      const receipt = { reference_code: 'VIP-7K3Q', follow_up: false, summary: { guest: 'Augustine Okafor', companions: 0, arrival_mode: 'own_transport', arrival_date: '2026-10-28', flight_number: null } }
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: receipt, error: null }), { status: 201 }))
      vi.stubGlobal('fetch', fetchMock)
      render(<RegistrationScreen token="abc123" event={EVENT} siteKey="site-key-1" />)
      const user = userEvent.setup()
      await reachReview(user)
      await user.click(screen.getByRole('checkbox'))
      await next(user)

      expect(screen.getByText('Complete the check above to show you are a person')).toBeInTheDocument()
      expect(fetchMock).not.toHaveBeenCalled()

      await vi.waitFor(() => expect(widget.solve).not.toBeNull())
      act(() => widget.solve?.('turnstile-token'))
      await next(user)
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(JSON.parse(String(init.body))).toMatchObject({ consent: true, turnstile_token: 'turnstile-token' })
    })
  })
})
