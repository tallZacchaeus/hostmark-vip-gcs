import { describe, expect, it } from 'vitest'
import { demoRequestSchema } from './demo-request'

const VALID = { name: 'Ada Nwosu', organisation: 'Lagos Leadership Forum', email: 'ada@example.com' }

describe('demoRequestSchema', () => {
  it('accepts a name, organisation and email, with the optional fields left out', () => {
    // Act
    const parsed = demoRequestSchema.parse(VALID)

    // Assert
    expect(parsed).toEqual({ ...VALID, website: '' })
  })

  it('trims text and keeps an event size and message when given', () => {
    // Act
    const parsed = demoRequestSchema.parse({ ...VALID, name: '  Ada Nwosu ', event_size: '50_200', message: '  Two venues.  ' })

    // Assert
    expect(parsed.name).toBe('Ada Nwosu')
    expect(parsed.event_size).toBe('50_200')
    expect(parsed.message).toBe('Two venues.')
  })

  it('refuses a missing name, a bad email and an unknown event size', () => {
    expect(demoRequestSchema.safeParse({ ...VALID, name: ' ' }).success).toBe(false)
    expect(demoRequestSchema.safeParse({ ...VALID, email: 'not-an-email' }).success).toBe(false)
    expect(demoRequestSchema.safeParse({ ...VALID, event_size: 'huge' }).success).toBe(false)
  })

  it('refuses line breaks in one-line fields, so they cannot reshape the email subject', () => {
    expect(demoRequestSchema.safeParse({ ...VALID, organisation: 'Forum\r\nBcc: someone@example.com' }).success).toBe(false)
    expect(demoRequestSchema.safeParse({ ...VALID, name: 'Ada\nNwosu' }).success).toBe(false)
  })

  it('caps the message length', () => {
    expect(demoRequestSchema.safeParse({ ...VALID, message: 'x'.repeat(2001) }).success).toBe(false)
  })
})
