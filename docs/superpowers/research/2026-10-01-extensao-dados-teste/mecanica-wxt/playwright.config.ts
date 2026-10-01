import { defineConfig } from '@playwright/test'

export default defineConfig({
  testMatch: ['**/*.e2e.ts'],
  workers: 1,
  reporter: 'list',
  webServer: {
    command: 'node e2e/serve.mjs',
    url: 'http://127.0.0.1:4599',
    reuseExistingServer: true,
  },
})
