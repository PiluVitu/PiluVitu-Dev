import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: './src/index.ts',
      wrangler: { configPath: './wrangler.jsonc' },
    }),
  ],
  test: {
    // Colocation: teste ao lado do fonte. O recorte em src/ deixa de fora
    // apps/financas/web/, que na Task 11 ganha config de Vitest própria.
    include: ['src/**/*.test.ts'],
  },
})
