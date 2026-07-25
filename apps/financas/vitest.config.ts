import { fileURLToPath } from 'node:url'
import {
  cloudflareTest,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    // cloudflareTest aceita uma funcao async — e assim que readD1Migrations,
    // que e assincrono, entra na config sem top-level await.
    cloudflareTest(async () => ({
      main: './src/index.ts',
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          // Le migrations/*.sql em ordem e ja quebra cada arquivo em statements.
          // fileURLToPath em vez de __dirname porque o workspace e ESM.
          TEST_MIGRATIONS: await readD1Migrations(
            fileURLToPath(new URL('./migrations', import.meta.url)),
          ),
        },
      },
    })),
  ],
  test: {
    // Colocation: teste ao lado do fonte. O recorte em src/ deixa de fora
    // apps/financas/web/, que na Task 11 ganha config de Vitest própria.
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
  },
})
