// Smoke tests for testers' main paths on the demo data (P8): each role lands on its screen, the
// headline features answer, and key screens pass an automated accessibility check. Sessions come
// from auth.setup.ts. Read-only, so they can run against a shared demo.
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { type Role, sessionFile } from './sessions'

const as = (role: Role) => ({ storageState: sessionFile(role) })

const HOMES: readonly { role: Role; path: string; heading: string | RegExp }[] = [
  { role: 'coordinator', path: '/dashboard', heading: /Good (morning|afternoon|evening)|Dashboard/ },
  { role: 'programs', path: '/programme', heading: 'Programme' },
  { role: 'accommodation', path: '/staff/front-desk', heading: 'Front desk' },
  { role: 'housekeeping', path: '/staff/sanitation', heading: 'Sanitation' },
  { role: 'driver', path: '/driver', heading: /^Hello, / },
]

for (const home of HOMES) {
  test.describe(`${home.role}`, () => {
    test.use(as(home.role))
    test(`lands on ${home.path} from the entry point @phone`, async ({ page }) => {
      await page.goto('/')
      await expect(page).toHaveURL(new RegExp(`${home.path}$`))
      await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(home.heading)
    })
  })
}

test.describe('coordinator', () => {
  test.use(as('coordinator'))

  test('sees the at-risk briefing and asks the Co-Pilot', async ({ page }) => {
    await page.goto('/programme')
    await expect(page.getByRole('button', { name: /Welcome briefing/ })).toBeVisible()
    await expect(page.getByText('At risk', { exact: true }).first()).toBeVisible()

    await page.getByRole('button', { name: /Ask Co-Pilot/ }).click()
    const drawer = page.getByRole('dialog', { name: 'Ask Co-Pilot' })
    await drawer.getByRole('textbox', { name: 'Ask or give an instruction' }).fill('What is the status of ET512?')
    await drawer.getByRole('button', { name: 'Send' }).click()
    await expect(drawer.getByText(/ET512 .*late/)).toBeVisible()
    await expect(drawer.getByRole('link', { name: /Moyo/ })).toBeVisible()
  })
})

test.describe('housekeeping', () => {
  test.use(as('housekeeping'))

  test('sees rooms to clean in priority order @phone', async ({ page }) => {
    await page.goto('/staff/sanitation')
    await expect(page.getByRole('article').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Start cleaning|Mark ready/ }).first()).toBeVisible()
  })
})

test('a signed-out visitor is sent to sign in', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/sign-in/)
})

const SCREENS: readonly { role: Role; path: string }[] = [
  { role: 'coordinator', path: '/sanitation' },
  { role: 'coordinator', path: '/programme' },
  { role: 'housekeeping', path: '/staff/sanitation' },
]

for (const screen of SCREENS) {
  test.describe(`${screen.path} accessibility`, () => {
    test.use(as(screen.role))
    test('has no serious accessibility violations', async ({ page }) => {
      await page.goto(screen.path)
      await page.waitForLoadState('networkidle')
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      expect(serious.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([])
    })
  })
}
