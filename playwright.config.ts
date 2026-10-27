// End-to-end smoke tests (P8) against a running app with the demo data:
//   SEED_PASSWORD=Hostmark-Demo-2026 pnpm local:setup --reset
//   ALLOW_PGLITE=true pnpm build && ALLOW_PGLITE=true pnpm start   (or the deployed URL)
//   E2E_BASE_URL=http://localhost:3000 pnpm test:e2e
// The tests only read, so they can run against a shared demo. PLAYWRIGHT_CHROMIUM_PATH points at a
// browser already on the machine when `playwright install` cannot be run.
import { defineConfig, devices } from '@playwright/test'

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, dependencies: ['setup'] },
    { name: 'phone', use: { ...devices['Pixel 7'] }, grep: /@phone/, dependencies: ['setup'] },
  ],
})
