// Setup for the `ui` test project (jsdom): Testing Library's DOM matchers, cleanup after each
// test, and stand-ins for browser APIs jsdom does not implement.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// jsdom has no layout, so scrolling is a no-op (multi-step forms scroll to the top).
window.scrollTo = () => undefined

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}))
