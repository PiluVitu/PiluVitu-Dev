import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // @piluvitu/tools é fonte TS linkada pelo workspace: sem exclude, o
  // pre-bundle do Vite tenta tratar como dep publicada e falha no .ts.
  optimizeDeps: { exclude: ['@piluvitu/tools'] },
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5273,
    // `wrangler dev` sobe o Worker em 8787; o proxy evita CORS no dev.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
