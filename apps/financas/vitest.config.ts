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
          // I1 (fix final): src/index.test.ts usa SELF.fetch, que roda contra
          // o env REAL de wrangler.jsonc — e os três secrets do Better Auth
          // não são `vars` (ver CLAUDE.md/Deploy §3), então em clone limpo
          // (CI, ou qualquer máquina sem .dev.vars) eles vêm undefined e
          // requireSession() cai no catch de getSession() → 503
          // auth_unavailable em vez do 401 esperado. Sem esta binding, o
          // teste só passa em quem tem .dev.vars local — MEDIDO: com
          // .dev.vars movido, 'rota desconhecida sob /api sem cookie de
          // sessão responde 401' falhava com 'expected 503 to be 401'.
          // Valores de teste, nunca reais: também impede a suíte de exercitar
          // as credenciais Google verdadeiras do .dev.vars do dono.
          BETTER_AUTH_SECRET: 'a'.repeat(32),
          GOOGLE_CLIENT_ID: 'client-id-de-teste',
          GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
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
