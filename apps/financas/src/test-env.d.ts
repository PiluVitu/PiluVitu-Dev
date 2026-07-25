declare module 'cloudflare:test' {
  // Tipa `import('cloudflare:test').env`. TEST_MIGRATIONS é injetado pelo
  // vitest.config.ts a partir de readD1Migrations('./migrations').
  interface ProvidedEnv {
    DB: D1Database
    TEST_MIGRATIONS: D1Migration[]
  }
}
