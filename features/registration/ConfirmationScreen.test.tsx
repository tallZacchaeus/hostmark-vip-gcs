import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ConfirmationScreen } from './ConfirmationScreen'
import { saveReceipt } from './receipt'

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
})
