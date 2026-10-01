import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'loja',
  testMatch: ['**/*.captura.ts'],
  workers: 1,
  reporter: 'list',
  timeout: 120_000,
})
