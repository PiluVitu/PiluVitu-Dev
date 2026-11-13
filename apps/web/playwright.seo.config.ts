import { defineConfig, devices } from '@playwright/test'

// O E2E de SEO precisa do build de produção (sitemap, robots e llms gerados no
// build) com a origem canônica de produção; o playwright.config.ts usa o `next dev`.
const PORTA = 3045

export default defineConfig({
  testMatch: ['**/app/seo.e2e.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORTA}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm build && pnpm exec next start -p ${PORTA}`,
    url: `http://localhost:${PORTA}/robots.txt`,
    reuseExistingServer: false,
    timeout: 900_000,
    cwd: '.',
    env: { NEXT_PUBLIC_SITE_URL: 'https://piluvitu.com.br' },
  },
})
