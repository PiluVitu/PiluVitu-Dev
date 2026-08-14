// NOTA DE TRANSCRIÇÃO (portado de apps/financas/src/test-env.d.ts): o brief
// original tipava isto via `declare module 'cloudflare:test' { interface
// ProvidedEnv {...} }`. MEDIDO contra @cloudflare/vitest-pool-workers@0.18.8
// (o instalado aqui): `ProvidedEnv` não existe em NENHUM .d.ts do pacote —
// `env` exportado de 'cloudflare:test' é tipado diretamente como
// `Cloudflare.Env`, o mesmo namespace que `wrangler types` gera em
// worker-configuration.d.ts (que já declara `DB: D1Database` a partir do
// binding real do wrangler.jsonc). Augmentar `ProvidedEnv` compilava sem
// erro mas não tinha NENHUM efeito — `tsc --noEmit` acusava `Property
// 'TEST_MIGRATIONS' does not exist on type 'Env'`. O binding certo a
// estender é `Cloudflare.Env`, via declaration merging de namespace.
declare namespace Cloudflare {
  interface Env {
    // Injetado só em teste por vitest.config.ts, a partir de
    // readD1Migrations('./migrations') — não existe no wrangler.jsonc.
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[]
  }
}
