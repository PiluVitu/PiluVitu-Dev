import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  // @piluvitu/tools é fonte TS linkada pelo workspace: sem exclude, o
  // pre-bundle do Vite tenta tratar como dep publicada e falha no .ts.
  // MEDIDO (Task 4, design system): @piluvitu/ui NÃO precisa entrar aqui.
  // Dev server real testado importando um componente `.tsx` de verdade
  // (`@piluvitu/ui/button`, cadeia até @radix-ui/react-slot, cva, cn,
  // clsx, tailwind-merge): o Vite serve o `.tsx`/`.ts` do pacote cru via
  // `/@fs/...` (tratado como fonte, não como dep publicada) e pre-bundleia
  // as deps transitivas reais (@radix-ui/*, react-hook-form, cmdk) sem
  // erro — nenhum "Failed to resolve dependency", nenhum loop de reload.
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
