# Monorepo + Go CLI/API — Design Spec

**Date:** 2026-05-13  
**Status:** Approved  
**Scope:** Converter o repositório para pnpm monorepo com apps/web (Next.js), packages/tools (TypeScript puro) e apps/api (Go CLI + HTTP server).

---

## 1. Motivação

O projeto tem três sub-sistemas independentes planejados: site web, CLI para linha de comando e extensão Chrome. Todos compartilham a mesma lógica de ferramentas (CPF, CNPJ, Base64, JWT, JSON, UUID, QR). Manter tudo num monorepo estruturado evita duplicação de código e permite publicar artefatos separados (binário Go, extensão Chrome) sem retrabalho futuro.

Ordem de execução: **Monorepo → CLI/API Go → Chrome Extension**. Este spec cobre o Monorepo e o Go.

---

## 2. Estrutura de diretórios

```
/                                   ← raiz do monorepo
├── pnpm-workspace.yaml             packages: [apps/web, packages/tools]
├── go.work                         Go workspace (inclui apps/api)
├── Makefile                        atalhos: dev, build-api, build-cli, test, lint
│
├── infra/
│   ├── docker-compose.yml          stack local completa (web + api)
│   ├── docker-compose.test.yml     containers para testes de integração Go
│   └── seed/
│       ├── data.json
│       └── seed.go
│
├── apps/
│   ├── web/                        ← Next.js (movido da raiz)
│   │   ├── Dockerfile
│   │   ├── .storybook/
│   │   ├── app/
│   │   │   └── (site)/
│   │   │       └── tools/
│   │   │           ├── page.tsx
│   │   │           ├── page.test.tsx
│   │   │           └── page.e2e.ts
│   │   ├── components/
│   │   │   └── <nome>/
│   │   │       ├── <nome>.tsx
│   │   │       ├── <nome>.test.tsx
│   │   │       └── <nome>.stories.tsx
│   │   └── …
│   │
│   └── api/                        ← Go (CLI + HTTP server)
│       ├── Dockerfile
│       ├── go.mod                  module github.com/PiluVitu/api  go 1.23
│       ├── go.sum
│       ├── cmd/
│       │   ├── api/
│       │   │   └── main.go         entry point HTTP server
│       │   └── cli/
│       │       └── main.go         entry point CLI binary
│       └── internal/
│           ├── tools/              lógica pura Go — sem HTTP, sem cobra
│           │   ├── cpf.go          + cpf_test.go
│           │   ├── cnpj.go         + cnpj_test.go
│           │   ├── base64.go       + base64_test.go
│           │   ├── jwt.go          + jwt_test.go
│           │   ├── jsonformat.go   + jsonformat_test.go
│           │   ├── uuid.go         + uuid_test.go
│           │   ├── qrencode.go     + qrencode_test.go
│           │   └── qrdecode.go     + qrdecode_test.go
│           ├── handlers/
│           │   ├── tools.go        HTTP handlers (delegam para internal/tools)
│           │   └── tools_test.go
│           └── router/
│               └── router.go       monta rotas com chi
│
└── packages/
    └── tools/                      ← @piluvitu/tools
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts            re-exports de tudo
            ├── cpf.ts              + cpf.test.ts
            ├── cnpj.ts             + cnpj.test.ts
            ├── base64.ts           + base64.test.ts
            ├── jwt-decode.ts       + jwt-decode.test.ts
            ├── json-format.ts      + json-format.test.ts
            ├── uuid.ts             + uuid.test.ts
            ├── qr-encode.ts        + qr-encode.test.ts
            └── qr-decode.ts        + qr-decode.test.ts
```

---

## 3. Regras de colocation (lei do projeto)

Todo teste e story fica no mesmo diretório do arquivo fonte. Nunca em pastas separadas como `stories/` ou `e2e/`.

| Camada | Fonte | Teste | Story |
|---|---|---|---|
| Componente React | `bio.tsx` | `bio.test.tsx` | `bio.stories.tsx` |
| Página Next.js | `page.tsx` | `page.test.tsx` | `page.stories.tsx` |
| Lib TypeScript pura | `cpf.ts` | `cpf.test.ts` | — |
| Handler Go | `tools.go` | `tools_test.go` | — |
| Lib Go pura | `cpf.go` | `cpf_test.go` | — |

Os diretórios `stories/` e `e2e/` da raiz atual são dissolvidos — arquivos migram para junto de seus componentes.

---

## 4. packages/tools (@piluvitu/tools)

### O que move

`lib/tools/*.ts` → `packages/tools/src/`. Todos os arquivos são TypeScript puro sem dependências de React/Next — a migração é um `mv` com ajuste de imports.

**Exceção — qr-decode.ts:** usa `@zxing/browser`. A lógica de decodificação a partir de `Uint8Array` vai para o pacote; o acesso à câmera permanece no componente React em `apps/web`. A função exportada é `decodeQrFromImageData(data: Uint8Array): string` — sem `navigator`, sem DOM.

### package.json

```json
{
  "name": "@piluvitu/tools",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./cpf": "./src/cpf.ts",
    "./cnpj": "./src/cnpj.ts",
    "./base64": "./src/base64.ts",
    "./jwt-decode": "./src/jwt-decode.ts",
    "./json-format": "./src/json-format.ts",
    "./uuid": "./src/uuid.ts",
    "./qr-encode": "./src/qr-encode.ts",
    "./qr-decode": "./src/qr-decode.ts"
  }
}
```

### Consumo em apps/web

`apps/web/package.json` adiciona `"@piluvitu/tools": "workspace:*"`.

Imports antigos → novos:
```ts
// antes
import { validateCpf } from '@/lib/tools/cpf'
// depois
import { validateCpf } from '@piluvitu/tools/cpf'
```

### Jest do pacote

`packages/tools/` tem `jest.config.ts` próprio com ambiente `node` (sem jsdom). O script raiz `pnpm -r test` roda ambos os workspaces.

---

## 5. apps/api (Go)

### CLI — cobra

```
piluvitu cpf validate <número>
piluvitu cpf generate

piluvitu cnpj validate <número>
piluvitu cnpj generate

piluvitu base64 encode <texto>
piluvitu base64 decode <texto>

piluvitu jwt decode <token>

piluvitu json format [--indent 2] < input.json

piluvitu uuid

piluvitu qr encode <texto> [--out qr.png]
piluvitu qr decode <imagem.png>
```

`cmd/cli/main.go` registra os cobra commands. Zero lógica no cmd — só parsing de args, delegação para `internal/tools` e formatação de output.

### HTTP API — chi

```
GET  /health

POST /tools/cpf/validate      {"value":"000.000.000-00"}
POST /tools/cpf/generate
POST /tools/cnpj/validate
POST /tools/cnpj/generate
POST /tools/base64/encode     {"value":"texto"}
POST /tools/base64/decode
POST /tools/jwt/decode
POST /tools/json/format       {"value":"...","indent":2}
GET  /tools/uuid
POST /tools/qr/encode         {"value":"texto"} → PNG base64
POST /tools/qr/decode         {"image":"<base64>"} → texto
```

Resposta padrão:
```json
{ "ok": true,  "result": "..." }
{ "ok": false, "error": "mensagem" }
```

### Camadas Go

- `internal/tools/` — lógica pura, testável em isolamento total, sem dependências de HTTP ou CLI
- `internal/handlers/` — recebe `http.ResponseWriter` + `*http.Request`, delega para `internal/tools`, serializa JSON
- `internal/router/` — monta o chi router com todos os handlers
- `cmd/api/main.go` — lê `PORT` do env, inicia o servidor
- `cmd/cli/main.go` — cobra root command + subcommands

### Dockerfile (multi-stage)

Builder compila `cmd/api` e `cmd/cli`. Imagem final `distroless` com só o binário `api`. O binário `cli` é publicado como artefato no GitHub Releases.

---

## 6. Ajustes de config em apps/web

| Config | Mudança |
|---|---|
| `tsconfig.json` | `paths: { "@/*": ["./*"] }` — continua, agora relativo a `apps/web/` |
| `jest.config.ts` | `testMatch: ["**/*.test.{ts,tsx}"]` — glob pega colocated |
| `playwright.config.ts` | `testMatch: ["**/*.e2e.ts"]`, `webServer.cwd: "apps/web"` |
| `.storybook/main.ts` | `stories: ["./**/*.stories.tsx"]` — relativo a `apps/web/` |
| `.env.local` | move para `apps/web/.env.local` |
| Husky hooks | permanecem na raiz — `pnpm -r prettier:fix && pnpm -r lint` |

---

## 7. Deploy

### Vercel (apps/web)

No dashboard da Vercel: **Root Directory** → `apps/web`. Build command e output dir permanecem iguais. Nenhum `vercel.json` necessário.

### Render (apps/api)

- **Service type:** Web Service (Docker)
- **Build:** `docker build -f apps/api/Dockerfile .` (raiz do repo)
- **Port:** 8080
- **Health check:** `GET /health`
- Free tier dorme após 15 min de inatividade — aceitável para uso pessoal/dev

`apps/web` consome a API via env var:

```
# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8080        # dev
# NEXT_PUBLIC_API_URL=https://api.render.com     # prod
```

Por ora as ferramentas rodam client-side em TypeScript — a env var fica preparada para migração futura.

---

## 8. Makefile raiz

```makefile
dev-web:
    pnpm --filter @piluvitu/web dev

dev-api:
    cd apps/api && go run ./cmd/api

dev:
    make -j2 dev-web dev-api

build-api:
    cd apps/api && go build -o bin/api ./cmd/api

build-cli:
    cd apps/api && go build -o bin/piluvitu ./cmd/cli

test:
    pnpm -r test && cd apps/api && go test ./...

lint:
    pnpm -r lint && cd apps/api && go vet ./...
```

---

## 9. go.work (raiz)

```
go 1.23

use ./apps/api
```

Permite adicionar futuros módulos Go (ex: `./apps/scraper`) sem alterar o `go.mod` da API.

---

## 10. docker-compose de infra

### infra/docker-compose.yml (dev local)

```yaml
services:
  api:
    build:
      context: ..
      dockerfile: apps/api/Dockerfile
    ports: ["8080:8080"]
    environment:
      PORT: "8080"

  web:
    build:
      context: ..
      dockerfile: apps/web/Dockerfile
    ports: ["3333:3333"]
    depends_on: [api]
```

### infra/docker-compose.test.yml (integração Go)

```yaml
services:
  api-test:
    build:
      context: ..
      dockerfile: apps/api/Dockerfile
    environment:
      PORT: "8081"
      GO_ENV: "test"
```

Usado com `go test -tags=integration ./...`. Por ora as ferramentas não têm DB — o arquivo existe pronto para crescer (Postgres, Redis, etc.).

---

## 11. Estratégia de testes

| Tipo | Ferramenta | Localização |
|---|---|---|
| Unit TypeScript | Jest (node env) | `packages/tools/src/*.test.ts` |
| Unit/componente React | Jest + jsdom | `apps/web/**/*.test.tsx` colocado |
| E2E web | Playwright | `apps/web/**/*.e2e.ts` colocado |
| Stories | Storybook | `apps/web/**/*.stories.tsx` colocado |
| Unit Go | `go test` | `apps/api/internal/**/*_test.go` colocado |
| Integração Go | `go test -tags=integration` | `apps/api/cmd/**/*_test.go` |

Comando raiz único: `make test` roda tudo.

---

## 12. Sequência de migração (ordem de execução)

1. Criar `packages/tools/` com `package.json` e mover `lib/tools/*`
2. Criar `apps/web/` e mover conteúdo da raiz para dentro
3. Atualizar `pnpm-workspace.yaml`
4. Ajustar configs: tsconfig, jest, playwright, storybook, husky
5. Atualizar imports `@/lib/tools/*` → `@piluvitu/tools/*` em `apps/web/`
6. Migrar stories e e2e existentes para colocated
7. Criar `apps/api/` com estrutura Go + go.mod + go.work
8. Implementar `internal/tools/` em Go (8 ferramentas + testes)
9. Implementar handlers HTTP e router chi
10. Implementar CLI com cobra
11. Criar Dockerfiles e `infra/docker-compose.yml`
12. Ajustar Vercel (Root Directory → apps/web) e configurar Render
13. Atualizar CLAUDE.md com nova estrutura

---

## 13. O que NÃO está no escopo deste spec

- Chrome Extension (spec separado, após este)
- Autenticação na API Go
- Banco de dados
- CI/CD (GitHub Actions) — decidido em spec futuro
