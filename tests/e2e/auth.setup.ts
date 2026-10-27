// Signs each demo role in once and saves the session, so the tests reuse it instead of signing in
// again (the sign-in rate limit allows only a few attempts a minute per address).
import { test as setup } from '@playwright/test'
import { ROLES, sessionFile } from './sessions'

const PASSWORD = process.env.E2E_PASSWORD ?? 'Hostmark-Demo-2026'

for (const role of ROLES) {
  setup(`sign in as ${role}`, async ({ page }) => {
    await page.goto('/sign-in')
    await page.locator('#signin-email').fill(`${role}@vipgcs.test`)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.locator('button[type=submit]').click()
    await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'))
    await page.context().storageState({ path: sessionFile(role) })
  })
}
