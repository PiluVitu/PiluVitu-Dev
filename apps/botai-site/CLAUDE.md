# CLAUDE.md — `apps/botai-site` (`@pilutech/botai-site`)

Landing do Botaí em `https://botai.pilutech.com.br`: Next 16 (App Router), React 19, TypeScript strict, Tailwind CSS 4 e `@piluvitu/ui`. O Claude Code carrega este arquivo junto com o `CLAUDE.md` da raiz.

- **Spec:** `docs/superpowers/specs/2026-10-02-botai-landing-design.md`. **Plano:** `docs/superpowers/plans/2026-10-02-botai-landing.md`. **Design:** `docs/superpowers/design/2026-10-02-botai-landing/`.
- **Grafia:** "Botaí" em todo texto visível; `botai` no técnico (ver "Identidade" em `apps/botai/CLAUDE.md`).

## Comandos

| Comando                     | O quê                                                              |
| --------------------------- | ------------------------------------------------------------------ |
| `make dev-botai-site`       | `next dev` em http://localhost:3020                                |
| `make build-botai-site`     | `next build` + gate do `@source` + conferência das rotas estáticas |
| `make test-botai-site`      | Jest + `node --test` (scripts)                                     |
| `make test-e2e-botai-site`  | build de produção + `next start` na 3020 + Playwright (com `CI=1`) |
| `make storybook-botai-site` | Storybook em http://localhost:6019                                 |
