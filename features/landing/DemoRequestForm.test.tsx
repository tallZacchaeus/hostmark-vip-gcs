import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, sentBody } from '@/tests/support/api-mock'
import { DemoRequestForm } from './DemoRequestForm'

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Your name/), 'Ada Nwosu')
  await user.type(screen.getByLabelText(/Organisation/), 'Lagos Leadership Forum')
  await user.type(screen.getByLabelText(/Work email/), 'ada@example.com')
}

describe('DemoRequestForm', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('says which fields are missing and sends nothing', async () => {
    // Arrange
    const user = userEvent.setup()
    const fetchMock = mockApi([])
    render(<DemoRequestForm />)

    // Act
    await user.click(screen.getByRole('button', { name: 'Request a demo' }))

    // Assert
    expect(screen.getByText('Enter your name')).toBeInTheDocument()
    expect(screen.getByText('Enter your organisation')).toBeInTheDocument()
    expect(screen.getByText('Enter your work email')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the request and thanks the person, naming the email the reply will go to', async () => {
    // Arrange
    const user = userEvent.setup()
    const fetchMock = mockApi([{ path: '/api/demo-requests', method: 'POST', status: 201, body: { received: true } }])
    render(<DemoRequestForm />)
    await fillRequired(user)
    await user.selectOptions(screen.getByLabelText(/How many VIP guests/), '50_200')
    await user.type(screen.getByLabelText(/Anything we should know/), 'Two venues.')

    // Act
    await user.click(screen.getByRole('button', { name: 'Request a demo' }))

    // Assert
    expect(await screen.findByRole('heading', { name: /Thank you/ })).toBeInTheDocument()
    expect(screen.getByText(/ada@example.com/)).toBeInTheDocument()
    expect(sentBody(fetchMock, 0)).toEqual({
      name: 'Ada Nwosu',
      organisation: 'Lagos Leadership Forum',
      email: 'ada@example.com',
      event_size: '50_200',
      message: 'Two venues.',
      website: '',
    })
  })

  it('shows the reason when the request could not be sent, and keeps what was typed', async () => {
    // Arrange
    const user = userEvent.setup()
    mockApi([
      {
        path: '/api/demo-requests',
        method: 'POST',
        status: 503,
        body: { code: 'demo_requests_unavailable', message: 'Demo requests are not open yet. Please try again later.' },
      },
    ])
    render(<DemoRequestForm />)
    await fillRequired(user)

    // Act
    await user.click(screen.getByRole('button', { name: 'Request a demo' }))

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Demo requests are not open yet')
    expect(screen.getByLabelText(/Your name/)).toHaveValue('Ada Nwosu')
  })

  it('keeps the bot trap out of reach of keyboard and screen-reader users', () => {
    // Act
    const { container } = render(<DemoRequestForm />)

    // Assert
    const trap = container.querySelector('input[name="website"]')
    expect(trap).toHaveAttribute('tabindex', '-1')
    expect(trap?.closest('[aria-hidden="true"]')).not.toBeNull()
  })
})
