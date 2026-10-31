declare namespace Cloudflare {
  interface Env {
    DB: import('./uso').BancoD1
    // Injetado por vitest.workers.config.ts a partir de sql/.
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[]
  }
}
