import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RegistrationScreen } from './RegistrationScreen'

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
})
