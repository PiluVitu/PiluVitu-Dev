# CLAUDE.md — `apps/pilutech-site` (`@pilutech/site`)

Landing da PiluTech em `https://pilutech.com.br`: Next 16 (App Router), React 19, TypeScript strict, Tailwind CSS 4 e `@piluvitu/ui`. O Claude Code carrega este arquivo junto com o `CLAUDE.md` da raiz.

- **Spec:** `docs/superpowers/specs/2026-10-02-pilutech-site-design.md`. **Plano:** `docs/superpowers/plans/2026-10-02-pilutech-site.md`. **Design:** `docs/superpowers/design/2026-10-02-pilutech-landing/`.
- **Molde:** o `apps/botai-site` (mesma estrutura, gate, conferência de rotas, testes e deploy).

## Comandos

| Comando                        | O quê                                                              |
| ------------------------------ | ------------------------------------------------------------------ |
| `make dev-pilutech-site`       | `next dev` em http://localhost:3021                                |
| `make build-pilutech-site`     | `next build` + gate do `@source` + conferência das rotas estáticas |
| `make test-pilutech-site`      | Jest + `node --test` (scripts)                                     |
| `make test-e2e-pilutech-site`  | build de produção + `next start` na 3021 + Playwright (com `CI=1`) |
| `make storybook-pilutech-site` | Storybook em http://localhost:6020                                 |
