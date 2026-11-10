import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmationScreen } from './ConfirmationScreen'
import { type RegistrationReceipt, saveReceipt } from './receipt'

const receiptWith = (summary: Partial<RegistrationReceipt['summary']>, followUp = false): RegistrationReceipt => ({
  reference_code: 'VIP-7K3Q',
  follow_up: followUp,
  summary: { guest: 'Dr Ngozi Eze', companions: 0, arrival_mode: 'flying', arrival_date: '2026-10-28', flight_number: null, ...summary },
})

describe('ConfirmationScreen', () => {
  afterEach(() => window.sessionStorage.clear())

  it('shows the reference, a summary and, when needed, that the team may get in touch', () => {
    saveReceipt('tok', {
      reference_code: 'VIP-7K3Q',
      follow_up: true,
      summary: { guest: 'Bishop Augustine Okafor', companions: 3, arrival_mode: 'flying', arrival_date: '2026-10-28', flight_number: 'EK783' },
    })
    render(<ConfirmationScreen token="tok" />)

    expect(screen.getByRole('heading', { name: 'Registration received' })).toBeInTheDocument()
    expect(screen.getByText('VIP-7K3Q')).toBeInTheDocument()
    expect(screen.getByText('Bishop Augustine Okafor and 3 guests')).toBeInTheDocument()
    expect(screen.getByText('Arriving Wed 28 Oct by EK783')).toBeInTheDocument()
    expect(screen.getByText('We may contact you about a few details.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Register another delegation' })).toHaveAttribute('href', '/register/tok')
  })

  it('still confirms when this tab has no receipt', () => {
    render(<ConfirmationScreen token="other" />)
    expect(screen.getByRole('heading', { name: 'Registration received' })).toBeInTheDocument()
    expect(screen.getByText(/Keep the reference code you were shown/)).toBeInTheDocument()
    expect(screen.queryByText(/VIP-/)).toBeNull()
  })

  it.each([
    [{ arrival_mode: 'pickup', companions: 1 }, 'Pickup on Wed 28 Oct', 'Dr Ngozi Eze and 1 guest'],
    [{ arrival_mode: 'own_transport', companions: 0 }, 'Arriving Wed 28 Oct by road', 'Dr Ngozi Eze'],
    [{ arrival_mode: 'flying', flight_number: null }, 'Arriving Wed 28 Oct by air', 'Dr Ngozi Eze'],
  ] as const)('summarises how the party arrives (%o)', (summary, arrival, party) => {
    saveReceipt('tok', receiptWith(summary))
    render(<ConfirmationScreen token="tok" />)
    expect(screen.getByText(arrival)).toBeInTheDocument()
    expect(screen.getByText(party)).toBeInTheDocument()
    expect(screen.queryByText('We may contact you about a few details.')).not.toBeInTheDocument()
  })

  it('leaves out the arrival when no date was given', () => {
    saveReceipt('tok', receiptWith({ arrival_date: null }))
    render(<ConfirmationScreen token="tok" />)
    expect(screen.queryByText(/Arriving|Pickup on/)).not.toBeInTheDocument()
  })

  it('copies the reference and says so for a moment', async () => {
    saveReceipt('tok', receiptWith({}))
    const user = userEvent.setup()
    render(<ConfirmationScreen token="tok" />)
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout')

    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('VIP-7K3Q')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()

    const reset = setTimeoutSpy.mock.calls.find(([, delay]) => delay === 2_000)?.[0] as () => void
    act(() => reset())
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })

  it('keeps the reference on screen when the clipboard is refused', async () => {
    saveReceipt('tok', receiptWith({}))
    const user = userEvent.setup()
    render(<ConfirmationScreen token="tok" />)
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))

    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.getByText('VIP-7K3Q')).toBeInTheDocument()
  })
})
