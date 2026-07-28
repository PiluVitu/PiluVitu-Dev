import { defineConfig } from 'vitest/config'

// Config separada de vitest.config.ts (que roda os testes do Worker sob o
// pool do Miniflare/cloudflareTest). O CLI de PDF (scripts/pdf-import.mjs)
// é Node puro, fora do Worker de propósito (ver cabeçalho do arquivo) — não
// tem `env`/bindings do Cloudflare, e rodar sob o pool workerd seria o
// ambiente errado pra ele. `environment: 'node'` aqui usa Node de verdade,
// e a resolução de módulo do Vite/esbuild (a mesma que já resolve
// `@piluvitu/tools` pra `web/`) entende os imports relativos sem extensão
// de packages/tools/src/*.ts — o `node --test` puro NÃO entende (MEDIDO:
// falha com ERR_MODULE_NOT_FOUND em `../money`), por isso esta suíte roda
// em Vitest e não no runner nativo do Node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.test.mjs'],
  },
})
