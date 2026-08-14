import { defineConfig } from 'vitest/config'

// Config separada de vitest.config.ts (que roda os testes do Worker sob o
// pool do Miniflare/cloudflareTest, com bindings D1/env do Cloudflare).
// scripts/gerar-import.mjs é Node puro, fora do Worker de propósito — lê
// SQLite local via `node:sqlite`, nunca importa nada do Worker/D1 direto.
// `environment: 'node'` roda Node de verdade; mesmo padrão de
// apps/financas/vitest.scripts.config.ts (scripts/pdf-import.mjs).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.test.mjs'],
  },
})
