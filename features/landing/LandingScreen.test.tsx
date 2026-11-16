import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LandingScreen } from './LandingScreen'

describe('LandingScreen', () => {
  it('leads with one main heading and two ways in: a demo request and staff sign-in', () => {
    // Act
    render(<LandingScreen />)

    // Assert
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    const demoLinks = screen.getAllByRole('link', { name: 'Request a demo' })
    expect(demoLinks.length).toBeGreaterThan(0)
    for (const link of demoLinks) expect(link).toHaveAttribute('href', '#demo')
    expect(screen.getAllByRole('link', { name: /Staff sign in/ })[0]).toHaveAttribute('href', '/sign-in')
    expect(screen.getByRole('region', { name: /Request a demo/ })).toHaveAttribute('id', 'demo')
  })

  it('shows the measured results and says how and when they were measured', () => {
    // Act
    render(<LandingScreen />)

    // Assert
    const results = screen.getByRole('region', { name: /Measured, not promised/ })
    expect(within(results).getByText('14 ms')).toBeInTheDocument()
    expect(within(results).getByText('100%')).toBeInTheDocument()
    expect(within(results).getByText(/30 flights/)).toBeInTheDocument()
    expect(within(results).getByText(/11 Nov 2026/)).toBeInTheDocument()
  })

  it('gives every screenshot a description and a fixed size, and loads those below the fold lazily', () => {
    // Act
    const { container } = render(<LandingScreen />)

    // Assert
    const images = [...container.querySelectorAll('img')]
    expect(images.length).toBeGreaterThan(3)
    for (const image of images) {
      expect(image.getAttribute('width')).toBeTruthy()
      expect(image.getAttribute('height')).toBeTruthy()
      if (!image.src.endsWith('.svg')) expect(image.alt).not.toBe('')
    }
    const lazy = images.filter((image) => image.getAttribute('loading') === 'lazy')
    expect(lazy.length).toBeGreaterThan(0)
  })
})
