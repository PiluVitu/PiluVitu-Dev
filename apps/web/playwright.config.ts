import { defineConfig, devices } from '@playwright/test'

// Com E2E_BASE_URL, roda contra um servidor já de pé (ex.: `next start` de um build de produção
// numa porta livre) e não sobe o `next dev` da 3333. Ver "Preview" no CLAUDE.md.
const servidorExterno = process.env.E2E_BASE_URL

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
    baseURL: servidorExterno ?? 'http://localhost:3333',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: servidorExterno
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3333',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        cwd: '.',
      },
})
