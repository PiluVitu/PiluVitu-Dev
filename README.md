# PiluVitu

Monorepo pessoal: site + blog, dashboard de ferramentas, votação de filmes e um módulo de controle financeiro PJ.

> Detalhes de cada frente vivem no `CLAUDE.md` do respectivo workspace. Este arquivo é só o **como rodar** e o **como publicar**.

## Frentes

| Workspace        | O que é                                                              | Onde roda                                       |
| ---------------- | -------------------------------------------------------------------- | ----------------------------------------------- |
| `apps/web`       | Next.js 16 — site, blog, `/tools`, `/tasks`, `/admin`, `/votacao`    | Vercel                                          |
| `apps/api`       | Go 1.23 + chi — votação, auth, distribuição de artigos com LLM local | MacBook, exposto por Cloudflare Tunnel          |
| `apps/financas`  | Cloudflare Worker (Hono + D1) + SPA Vite                             | `financas.piluvitu.com.br`                      |
| `packages/ui`    | `@piluvitu/ui` — design system (tokens + componentes shadcn)         | consumido por `apps/web` e pela SPA do finanças |
| `packages/tools` | `@piluvitu/tools` — lógica pura em TS                                | consumido pelo `/tools` e pelo finanças         |

## Pré-requisitos

- **Node 22** e **pnpm ≥ 11**
- **Go 1.23** (para `apps/api`)
- **Ollama** com `qwen2.5:3b-instruct` e `qwen2.5:7b-instruct` (revisão de artigo, insight, leitura de PDF)
- **wrangler** autenticado na conta Cloudflare que hospeda a zona `piluvitu.com.br`

```bash
pnpm install
```

## Rodar local

```bash
make dev          # web + API Go + Storybook em paralelo
make dev-web      # só o Next.js        → http://localhost:3333
make dev-api      # só a API Go (air)   → http://localhost:8081
make storybook    # só o Storybook      → http://localhost:6017
make stop         # libera as portas se travarem
```

O finanças sobe à parte, porque Worker e SPA são um processo só:

```bash
pnpm --filter @piluvitu/financas dev        # Worker + SPA → http://localhost:8787
pnpm --filter @piluvitu/financas-web dev    # só a SPA com proxy → http://localhost:5273
```

⚠️ **O login social só fecha pela porta `5273`.** O `BETTER_AUTH_URL` do `.dev.vars` aponta para lá, e o Better Auth só confia em requisição vinda da origem do `baseURL` — pela `8787` o `POST` de sign-in volta `403`.

A stack com Ollama + API + túnel junta tudo, mas exige `process-compose` instalado:

```bash
make stack
```

## Testes e lint

```bash
make test    # pnpm -r test + go test ./...
make lint    # ESLint + tsc + go vet
```

⚠️ **`pnpm -r <script>` pula em silêncio** workspace que não declara aquele script — sem erro e sem aviso. Já custou a este projeto os 14 componentes migrados ficarem um commit inteiro sem lint. Ao criar pacote novo, confirme que ele aparece na contagem de "N of M workspace projects".

## Publicar

### `apps/web` → Vercel

Automático: push na `main` dispara deploy de produção.

### `apps/financas` → Cloudflare Worker

**A ordem importa.** Código novo contra schema velho quebra — a migration `0006` já seria esse caso, porque a tela de Comprometido lê a tabela de recorrentes.

```bash
# 1. conferir o que está pendente
pnpm --filter @piluvitu/financas exec wrangler d1 migrations list piluvitu-financas --remote

# 2. aplicar
pnpm --filter @piluvitu/financas exec wrangler d1 migrations apply piluvitu-financas --remote

# 3. publicar (builda a SPA antes; os dois gates de build rodam aqui)
pnpm --filter @piluvitu/financas run deploy

# 4. conferir
curl -s -o /dev/null -w '%{http_code}\n' https://financas.piluvitu.com.br/api/health   # 200
curl -s -o /dev/null -w '%{http_code}\n' https://financas.piluvitu.com.br/api/accounts # 401
```

O `401` do passo 4 é o resultado certo: significa que o guard de sessão está ativo. Um `503` ali indica que o `BETTER_AUTH_SECRET` não chegou.

⚠️ **Migration no D1 é forward-only.** Não existe down migration, e índice não pode ser alterado — só dropado (irreversível) e recriado. Antes de aplicar algo destrutivo, tire um dump:

```bash
make backup-financas    # export + gzip + rotação em ~/Backups/financas
```

### `apps/api` (Go) → Cloudflare Tunnel

Roda no MacBook. Não há deploy remoto.

```bash
make tunnel-up      # sobe api + cloudflared
make tunnel-logs
make tunnel-down
```

### Secrets de produção do finanças

```bash
pnpm --filter @piluvitu/financas exec wrangler secret list   # confere os nomes
pnpm --filter @piluvitu/financas exec wrangler secret put BETTER_AUTH_SECRET
pnpm --filter @piluvitu/financas exec wrangler secret put GOOGLE_CLIENT_ID
pnpm --filter @piluvitu/financas exec wrangler secret put GOOGLE_CLIENT_SECRET
pnpm --filter @piluvitu/financas exec wrangler secret put INGEST_TOKEN
```

Gere valores com `openssl rand -base64 32`. O `wrangler secret` **não devolve o valor depois** — guarde antes de colar.

## Comandos locais que usam AI

Rodam no MacBook com o Ollama ligado. Nenhum precisa de servidor no ar depois.

```bash
# fatura em PDF → CSV que a tela #/importar lê
node apps/financas/scripts/pdf-import.mjs fatura.pdf

# gera o insight financeiro e empurra para o D1 (serviço Python, apps/promeia)
make insight
```

## Deploy automatizado

`.github/workflows/deploy-financas.yml` publica o finanças depois do CI verde na `main`. Fica **skipado** até:

- `CLOUDFLARE_ACCOUNT_ID` em _Settings → Variables_
- `CLOUDFLARE_API_TOKEN` em _Settings → Secrets_

Ele tira um dump antes de migrar (artifact, 30 dias) e **barra migration destrutiva** — `DROP`, `DELETE FROM` e `TRUNCATE` pedem aplicação manual, porque revisão de código não enxerga o que existe na produção.

## Segurança de dependência

pnpm 11 bloqueia lifecycle script por padrão. Dependência que precise de um entra em `allowBuilds` no `pnpm-workspace.yaml` — **nunca** `dangerouslyAllowAllBuilds`. `minimumReleaseAge: 1440` pula versão publicada há menos de 24 h.
