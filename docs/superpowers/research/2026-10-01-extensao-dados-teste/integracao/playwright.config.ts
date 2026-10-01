import { defineConfig } from '@playwright/test'

export default defineConfig({
  testMatch: ['**/*.e2e.ts'],
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: { trace: 'on-first-retry' },
})
