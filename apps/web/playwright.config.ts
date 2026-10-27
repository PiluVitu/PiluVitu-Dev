import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testMatch: ['**/*.e2e.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  // O `next dev` 16.4 compila cada rota na 1ª visita e a navegação para uma
  // rota nova passa dos 5 s padrão.
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:3333',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3333',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    cwd: '.',
  },
})
