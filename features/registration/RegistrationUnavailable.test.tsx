import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RegistrationUnavailable } from './RegistrationUnavailable'

describe('RegistrationUnavailable', () => {
  it('tells a guest with an unknown link to ask for the current one, without naming the event', () => {
    render(<RegistrationUnavailable reason="invalid" />)
    expect(screen.getByRole('heading', { name: 'This link is not valid' })).toBeInTheDocument()
    expect(screen.getByText(/Ask the organisers for the current registration link/)).toBeInTheDocument()
    expect(screen.queryByText('REGISTRATION FOR')).not.toBeInTheDocument()
  })

  it('names the event when registration is closed', () => {
    render(<RegistrationUnavailable reason="closed" eventName="Lagos Leadership Summit 2026" />)
    expect(screen.getByRole('heading', { name: 'Registration is closed' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Lagos Leadership Summit 2026' })).toBeInTheDocument()
    expect(screen.getByText(/Contact them directly/)).toBeInTheDocument()
  })

  it('asks the guest to wait when the form was opened too often', () => {
    render(<RegistrationUnavailable reason="busy" />)
    expect(screen.getByRole('heading', { name: 'Too many requests' })).toBeInTheDocument()
    expect(screen.getByText(/Wait a minute and reload the page/)).toBeInTheDocument()
  })
})
