# Monorepo + Go CLI/API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converter o repositório para pnpm monorepo com `apps/web` (Next.js), `packages/tools` (@piluvitu/tools TypeScript puro), e `apps/api` (Go CLI + HTTP server com 8 ferramentas).

**Architecture:** pnpm workspace gerencia os pacotes TypeScript/Node; go.work gerencia o módulo Go em `apps/api`; lógica pura fica isolada em `internal/tools` (sem HTTP, sem cobra), handlers delegam para ela, cmd apenas parseia args. Testes e stories são colocalizados com o arquivo fonte.

**Tech Stack:** Next.js 16 + pnpm workspaces; Go 1.23 + cobra v1.8 + chi v5 + skip2/go-qrcode + makiuchi-d/gozxing; Docker multi-stage distroless; Render (Go API), Vercel (web).

**Spec:** `docs/superpowers/specs/2026-05-13-monorepo-go-design.md`

---

## Mapa de arquivos

### Criados (novos)
| Arquivo | Responsabilidade |
|---|---|
| `packages/tools/package.json` | Manifesto do pacote @piluvitu/tools |
| `packages/tools/tsconfig.json` | TypeScript config do pacote |
| `packages/tools/jest.config.ts` | Jest config isolado do pacote |
| `packages/tools/src/index.ts` | Barrel de re-exports |
| `go.work` | Go workspace na raiz |
| `Makefile` | Atalhos de dev/build/test |
| `apps/api/go.mod` | Módulo Go |
| `apps/api/cmd/api/main.go` | Entry point HTTP server |
| `apps/api/cmd/cli/main.go` | Entry point CLI binary |
| `apps/api/internal/tools/cpf.go` + `cpf_test.go` | Validação/geração CPF |
| `apps/api/internal/tools/cnpj.go` + `cnpj_test.go` | Validação/geração CNPJ |
| `apps/api/internal/tools/base64.go` + `base64_test.go` | Encode/decode Base64 |
| `apps/api/internal/tools/jwt.go` + `jwt_test.go` | Decode JWT |
| `apps/api/internal/tools/jsonformat.go` + `jsonformat_test.go` | Format/minify/validate JSON |
| `apps/api/internal/tools/uuid.go` + `uuid_test.go` | Geração UUID v4 |
| `apps/api/internal/tools/qrencode.go` + `qrencode_test.go` | QR code encode → PNG bytes |
| `apps/api/internal/tools/qrdecode.go` + `qrdecode_test.go` | QR code decode de imagem |
| `apps/api/internal/handlers/tools.go` + `tools_test.go` | HTTP handlers |
| `apps/api/internal/router/router.go` | chi router |
| `apps/api/Dockerfile` | Multi-stage build Go |
| `apps/web/Dockerfile` | Build Next.js |
| `infra/docker-compose.yml` | Stack local dev |
| `infra/docker-compose.test.yml` | Containers teste integração |
| `infra/seed/data.json` | Dados de seed |

### Movidos (git mv)
| De | Para |
|---|---|
| `lib/tools/*.ts` + `*.test.ts` | `packages/tools/src/` |
| `app/`, `components/`, `lib/`, `hooks/`, `mocks/`, `public/`, `content/`, `tina/`, `utils/` | `apps/web/` (mesmo nome) |
| `keystatic.config.ts`, `next.config.mjs`, `next-env.d.ts` | `apps/web/` |
| `tsconfig.json`, `jest.config.ts`, `jest.setup.ts`, `playwright.config.ts` | `apps/web/` |
| `components.json`, `postcss.config.mjs` | `apps/web/` |
| `.storybook/` | `apps/web/.storybook/` |
| `stories/*.stories.tsx` | Colocado em `apps/web/components/<componente>/` |
| `e2e/kanban.spec.ts` | `apps/web/app/(site)/tasks/kanban.e2e.ts` |
| `e2e/tools.spec.ts` | `apps/web/app/(site)/tools/tools.e2e.ts` |
| `e2e/articles.spec.ts` | `apps/web/app/(site)/articles.e2e.ts` (ou junto do componente) |

### Modificados
| Arquivo | O que muda |
|---|---|
| `pnpm-workspace.yaml` | `packages: ["apps/web", "packages/tools"]` |
| `package.json` (raiz) | Vira workspace mínimo |
| `apps/web/package.json` | Adiciona `@piluvitu/tools: workspace:*`, name `@piluvitu/web` |
| `apps/web/jest.config.ts` | `testMatch` sem restrição a `lib/tools/` |
| `apps/web/playwright.config.ts` | `testMatch: ["**/*.e2e.ts"]`, remove `testDir` |
| `apps/web/.storybook/main.ts` | glob atualizado para colocated |

---

## FASE 1 — Extrair packages/tools

### Task 1: Criar scaffolding de packages/tools

**Files:**
- Create: `packages/tools/package.json`
- Create: `packages/tools/tsconfig.json`
- Create: `packages/tools/jest.config.ts`
- Create: `packages/tools/src/.gitkeep`

- [ ] **Criar `packages/tools/package.json`:**

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
  },
  "devDependencies": {
    "@types/jest": "^30.0.0",
    "@types/qrcode": "^1.5.6",
    "jest": "^30.4.2",
    "jest-environment-jsdom": "^30.4.1",
    "ts-jest": "^29.4.9",
    "typescript": "^5.9.3"
  },
  "dependencies": {
    "@zxing/browser": "^0.2.0",
    "qrcode": "^1.5.4"
  },
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch"
  }
}
```

- [ ] **Criar `packages/tools/tsconfig.json`:**

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "target": "ES2017"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Criar `packages/tools/jest.config.ts`:**

```ts
import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'jest-environment-jsdom',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { moduleResolution: 'node' } }],
  },
  testMatch: ['**/*.test.ts'],
}

export default config
```

- [ ] **Criar diretório src:**

```bash
mkdir -p packages/tools/src
```

---

### Task 2: Atualizar pnpm-workspace.yaml e instalar

**Files:**
- Modify: `pnpm-workspace.yaml`

- [ ] **Substituir conteúdo de `pnpm-workspace.yaml`:**

```yaml
packages:
  - "apps/web"
  - "packages/tools"

allowBuilds:
  better-sqlite3: false
  core-js: false
  core-js-pure: true
  esbuild: true
  protobufjs: false
  sharp: true
  unrs-resolver: true

minimumReleaseAge: 1440
```

> Nota: `apps/web` ainda não existe — o pnpm vai ignorar entradas ausentes no install. Isso é esperado neste ponto.

- [ ] **Rodar pnpm install para criar symlinks:**

```bash
pnpm install
```

Expected: warning sobre `apps/web` não encontrado — OK. `packages/tools` deve aparecer nos workspaces.

---

### Task 3: Mover tools TypeScript para packages/tools/src

**Files:**
- Move: `lib/tools/*.ts` → `packages/tools/src/`

- [ ] **git mv de todos os arquivos (fonte + testes):**

```bash
git mv lib/tools/cpf.ts packages/tools/src/cpf.ts
git mv lib/tools/cpf.test.ts packages/tools/src/cpf.test.ts
git mv lib/tools/cnpj.ts packages/tools/src/cnpj.ts
git mv lib/tools/cnpj.test.ts packages/tools/src/cnpj.test.ts
git mv lib/tools/base64.ts packages/tools/src/base64.ts
git mv lib/tools/base64.test.ts packages/tools/src/base64.test.ts
git mv lib/tools/jwt-decode.ts packages/tools/src/jwt-decode.ts
git mv lib/tools/jwt-decode.test.ts packages/tools/src/jwt-decode.test.ts
git mv lib/tools/json-format.ts packages/tools/src/json-format.ts
git mv lib/tools/json-format.test.ts packages/tools/src/json-format.test.ts
git mv lib/tools/uuid.ts packages/tools/src/uuid.ts
git mv lib/tools/uuid.test.ts packages/tools/src/uuid.test.ts
git mv lib/tools/qr-encode.ts packages/tools/src/qr-encode.ts
git mv lib/tools/qr-encode.test.ts packages/tools/src/qr-encode.test.ts
git mv lib/tools/qr-decode.ts packages/tools/src/qr-decode.ts
git mv lib/tools/qr-decode.test.ts packages/tools/src/qr-decode.test.ts
rmdir lib/tools
```

- [ ] **Criar `packages/tools/src/index.ts`:**

```ts
export * from './cpf'
export * from './cnpj'
export * from './base64'
export * from './jwt-decode'
export * from './json-format'
export * from './uuid'
export * from './qr-encode'
export * from './qr-decode'
```

- [ ] **Rodar testes do pacote para verificar:**

```bash
pnpm --filter @piluvitu/tools test
```

Expected: todos os testes que passavam antes devem passar. Se houver erro de `moduleNameMapper` faltando `@/*`, não há problema — tools não usam esse alias.

- [ ] **Commit:**

```bash
git add packages/tools/ pnpm-workspace.yaml lib/
git commit -m "feat: extract @piluvitu/tools workspace package from lib/tools"
```

---

## FASE 2 — Migrar apps/web

### Task 4: Preparar package.json e criar apps/web

**Files:**
- Create: `apps/web/package.json`
- Modify: `package.json` (raiz)

- [ ] **Criar `apps/web/` e copiar package.json raiz como base:**

```bash
mkdir -p apps/web
cp package.json apps/web/package.json
```

- [ ] **Editar `apps/web/package.json`** — mudar o `name` para `@piluvitu/web` e adicionar `@piluvitu/tools` em `dependencies`:

No campo `"name"`:
```json
"name": "@piluvitu/web",
```

No campo `"dependencies"`, adicionar:
```json
"@piluvitu/tools": "workspace:*",
```

- [ ] **Substituir `package.json` na raiz por versão workspace mínima:**

```json
{
  "name": "piluvitu-monorepo",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter @piluvitu/web dev",
    "build": "pnpm --filter @piluvitu/web build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "prettier:fix": "pnpm -r prettier:fix"
  }
}
```

---

### Task 5: git mv de todos os arquivos Next.js para apps/web

**Files:**
- Move: todos os diretórios e configs Next.js → `apps/web/`

- [ ] **Mover diretórios:**

```bash
git mv app apps/web/app
git mv components apps/web/components
git mv hooks apps/web/hooks
git mv lib apps/web/lib
git mv mocks apps/web/mocks
git mv public apps/web/public
git mv content apps/web/content
git mv tina apps/web/tina
git mv utils apps/web/utils
git mv stories apps/web/stories
git mv e2e apps/web/e2e
```

- [ ] **Mover arquivos de config:**

```bash
git mv keystatic.config.ts apps/web/keystatic.config.ts
git mv next.config.mjs apps/web/next.config.mjs
git mv next-env.d.ts apps/web/next-env.d.ts
git mv tsconfig.json apps/web/tsconfig.json
git mv jest.config.ts apps/web/jest.config.ts
git mv jest.setup.ts apps/web/jest.setup.ts
git mv playwright.config.ts apps/web/playwright.config.ts
git mv components.json apps/web/components.json
git mv postcss.config.mjs apps/web/postcss.config.mjs
git mv .storybook apps/web/.storybook
```

- [ ] **Mover arquivos .env (não são rastreados pelo git, usar mv):**

```bash
mv .env apps/web/.env 2>/dev/null || true
mv .env.local apps/web/.env.local 2>/dev/null || true
mv .env.example apps/web/.env.example 2>/dev/null || true
```

- [ ] **Atualizar `pnpm-workspace.yaml` — adicionar `apps/web`:**

Já está no arquivo. Confirmar que está assim:
```yaml
packages:
  - "apps/web"
  - "packages/tools"
```

- [ ] **Rodar pnpm install:**

```bash
pnpm install
```

Expected: sem warnings sobre pacotes ausentes. Symlinks criados para `@piluvitu/tools` e `@piluvitu/web`.

- [ ] **Commit parcial:**

```bash
git add apps/web/ package.json
git commit -m "chore: move Next.js app to apps/web workspace"
```

---

### Task 6: Atualizar configs em apps/web

**Files:**
- Modify: `apps/web/tsconfig.json`
- Modify: `apps/web/jest.config.ts`
- Modify: `apps/web/playwright.config.ts`
- Modify: `apps/web/.storybook/main.ts`

- [ ] **Verificar `apps/web/tsconfig.json`** — o paths `@/*` já aponta para `"./*"`. Agora que o tsconfig está em `apps/web/`, isso resolve para `apps/web/*`. Nenhuma mudança necessária.

```json
"paths": {
  "@/*": ["./*"]
}
```

- [ ] **Atualizar `apps/web/jest.config.ts`** — ampliar testMatch para pegar testes colocalizados em qualquer lugar do app:

```ts
import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'jest-environment-jsdom',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { moduleResolution: 'node' } }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@piluvitu/tools/(.*)$': '<rootDir>/../../packages/tools/src/$1',
    '^@piluvitu/tools$': '<rootDir>/../../packages/tools/src/index.ts',
  },
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
}

export default config
```

- [ ] **Atualizar `apps/web/playwright.config.ts`** — trocar `testDir` por `testMatch` para pegar arquivos `.e2e.ts` colocalizados:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testMatch: ['**/*.e2e.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3333',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3333',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    cwd: '.',
  },
})
```

- [ ] **Atualizar `apps/web/.storybook/main.ts`** — stories agora colocalizados nos componentes:

```ts
import type { StorybookConfig } from '@storybook/nextjs'

const config: StorybookConfig = {
  stories: [
    './**/*.mdx',
    './**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  addons: [
    '@storybook/addon-onboarding',
    '@storybook/addon-docs',
    '@chromatic-com/storybook',
  ],
  framework: {
    name: '@storybook/nextjs',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  staticDirs: ['../public'],
}
export default config
```

- [ ] **Commit:**

```bash
git add apps/web/jest.config.ts apps/web/playwright.config.ts apps/web/.storybook/main.ts
git commit -m "chore: update jest/playwright/storybook configs for apps/web colocation"
```

---

### Task 7: Atualizar imports @/lib/tools → @piluvitu/tools

**Files:**
- Modify: todos arquivos em `apps/web/` que importam de `@/lib/tools/*`

- [ ] **Encontrar todos os imports a atualizar:**

```bash
grep -r "@/lib/tools" apps/web --include="*.ts" --include="*.tsx" -l
```

- [ ] **Substituir em todos os arquivos encontrados** — para cada arquivo listado, trocar `@/lib/tools/<nome>` por `@piluvitu/tools/<nome>`. Exemplos:

```ts
// antes
import { validarCPF, gerarCPF } from '@/lib/tools/cpf'
import { formatJSON } from '@/lib/tools/json-format'

// depois
import { validarCPF, gerarCPF } from '@piluvitu/tools/cpf'
import { formatJSON } from '@piluvitu/tools/json-format'
```

- [ ] **Verificar que não restou nenhum import antigo:**

```bash
grep -r "@/lib/tools" apps/web --include="*.ts" --include="*.tsx"
```

Expected: nenhum resultado.

- [ ] **Rodar type-check:**

```bash
cd apps/web && pnpm exec tsc --noEmit
```

Expected: zero erros de tipo.

- [ ] **Rodar testes:**

```bash
pnpm --filter @piluvitu/web test
```

Expected: todos passam.

- [ ] **Commit:**

```bash
git add apps/web/
git commit -m "chore: update imports from @/lib/tools to @piluvitu/tools"
```

---

### Task 8: Migrar stories para colocalizadas e e2e para colocalizados

**Files:**
- Move: `apps/web/stories/*.stories.tsx` → `apps/web/components/<componente>/`
- Move: `apps/web/e2e/*.spec.ts` → `apps/web/app/(site)/<rota>/*.e2e.ts`
- Delete: arquivos de exemplo do Storybook

- [ ] **Mover stories de kanban:**

```bash
git mv apps/web/stories/KanbanCard.stories.tsx apps/web/components/kanban/kanban-card.stories.tsx
git mv apps/web/stories/KanbanColumn.stories.tsx apps/web/components/kanban/kanban-column.stories.tsx
git mv apps/web/stories/CardModal.stories.tsx apps/web/components/kanban/card-modal.stories.tsx
git mv apps/web/stories/TagBadge.stories.tsx apps/web/components/kanban/tag-badge.stories.tsx
git mv apps/web/stories/TagManagerDialog.stories.tsx apps/web/components/kanban/tag-manager-dialog.stories.tsx
```

- [ ] **Mover stories de feed/artigos** — antes, verificar onde cada componente vive:

```bash
ls apps/web/components/
```

Mover cada story para junto do componente correspondente. Padrão:
- `FeedPostCard.stories.tsx` → `apps/web/components/<nome-do-componente>/feed-post-card.stories.tsx`
- `FeedFilters.stories.tsx` → mesma pasta do componente FeedFilters
- `FeedLoadMore.stories.tsx` → mesma pasta do componente FeedLoadMore
- `FeedSearch.stories.tsx` → mesma pasta do componente FeedSearch
- `ArticleCard.stories.tsx` → mesma pasta do componente ArticleCard

- [ ] **Mover stories de tools:**

```bash
git mv apps/web/stories/tools/ apps/web/components/tools/  # ou mover cada arquivo individualmente
```

- [ ] **Deletar arquivos de exemplo do Storybook (são defaults do Storybook, não componentes reais):**

```bash
git rm apps/web/stories/Button.stories.ts
git rm apps/web/stories/Button.tsx
git rm apps/web/stories/Header.stories.ts
git rm apps/web/stories/Header.tsx
git rm apps/web/stories/Page.stories.ts
git rm apps/web/stories/Page.tsx
git rm apps/web/stories/button.css
git rm apps/web/stories/header.css
git rm apps/web/stories/page.css
```

- [ ] **Mover assets do Storybook:**

```bash
git mv apps/web/stories/assets apps/web/.storybook/assets 2>/dev/null || true
```

- [ ] **Remover diretório stories se vazio:**

```bash
rmdir apps/web/stories 2>/dev/null || true
```

- [ ] **Mover e2e para colocalizados:**

```bash
git mv apps/web/e2e/kanban.spec.ts apps/web/app/\(site\)/tasks/kanban.e2e.ts
git mv apps/web/e2e/tools.spec.ts apps/web/app/\(site\)/tools/tools.e2e.ts
git mv apps/web/e2e/articles.spec.ts apps/web/app/\(site\)/articles.e2e.ts
rmdir apps/web/e2e
```

- [ ] **Verificar que o Storybook carrega as stories:**

```bash
pnpm --filter @piluvitu/web storybook
```

Abrir `http://localhost:6017` e confirmar que os componentes aparecem.

- [ ] **Rodar e2e para verificar:**

```bash
pnpm --filter @piluvitu/web test:e2e
```

Expected: todos os testes passam.

- [ ] **Commit:**

```bash
git add apps/web/
git commit -m "chore: migrate stories and e2e to colocated files"
```

---

### Task 9: Verificar saúde completa do apps/web

- [ ] **Rodar lint:**

```bash
pnpm --filter @piluvitu/web lint
```

- [ ] **Rodar todos os testes unitários:**

```bash
pnpm --filter @piluvitu/tools test
pnpm --filter @piluvitu/web test
```

- [ ] **Rodar build:**

```bash
pnpm --filter @piluvitu/web build
```

Expected: build limpo sem erros de tipo ou lint.

- [ ] **Commit de checkpoint:**

```bash
git add -A
git commit -m "chore: monorepo migration complete — web and tools verified"
```

> **Checkpoint:** neste ponto o monorepo está funcional. O web app roda exatamente como antes, só com a estrutura reorganizada.

---

## FASE 3 — Scaffold apps/api (Go)

### Task 10: Criar estrutura Go e go.work

**Files:**
- Create: `apps/api/go.mod`
- Create: `apps/api/cmd/api/main.go` (stub)
- Create: `apps/api/cmd/cli/main.go` (stub)
- Create: `go.work`

- [ ] **Criar estrutura de diretórios:**

```bash
mkdir -p apps/api/cmd/api
mkdir -p apps/api/cmd/cli
mkdir -p apps/api/internal/tools
mkdir -p apps/api/internal/handlers
mkdir -p apps/api/internal/router
```

- [ ] **Criar `apps/api/go.mod`:**

```
module github.com/PiluVitu/api

go 1.23

require (
	github.com/go-chi/chi/v5 v5.1.0
	github.com/makiuchi-d/gozxing v0.1.0
	github.com/skip2/go-qrcode v0.0.0-20230509100039-8657c5c073c2
	github.com/spf13/cobra v1.8.1
)
```

- [ ] **Criar `apps/api/cmd/api/main.go` (stub):**

```go
package main

import (
	"fmt"
	"net/http"
	"os"

	"github.com/PiluVitu/api/internal/router"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	handler := router.New()
	addr := ":" + port
	fmt.Printf("API listening on %s\n", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		os.Exit(1)
	}
}
```

- [ ] **Criar `apps/api/cmd/cli/main.go` (stub):**

```go
package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

func main() {
	root := &cobra.Command{
		Use:   "piluvitu",
		Short: "Ferramentas de desenvolvimento da PiluVitu",
	}
	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
```

- [ ] **Criar `apps/api/internal/router/router.go` (stub):**

```go
package router

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func New() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok":true}`))
	})
	return r
}
```

- [ ] **Criar `go.work` na raiz:**

```
go 1.23

use ./apps/api
```

- [ ] **Baixar dependências e verificar que compila:**

```bash
cd apps/api && go mod tidy && cd ../.. && go build ./apps/api/cmd/api && go build ./apps/api/cmd/cli
```

Expected: binários `api` e `cli` criados na raiz (podem ser deletados em seguida).

```bash
rm -f api cli
```

- [ ] **Commit:**

```bash
git add apps/api/ go.work
git commit -m "feat: scaffold apps/api Go module with chi router stub"
```

---

## FASE 4 — Go internal/tools (8 ferramentas)

### Task 11: CPF e CNPJ em Go

**Files:**
- Create: `apps/api/internal/tools/cpf.go` + `cpf_test.go`
- Create: `apps/api/internal/tools/cnpj.go` + `cnpj_test.go`

- [ ] **Escrever o teste CPF primeiro (`apps/api/internal/tools/cpf_test.go`):**

```go
package tools_test

import (
	"strings"
	"testing"

	"github.com/PiluVitu/api/internal/tools"
)

func TestValidarCPF(t *testing.T) {
	tests := []struct {
		input string
		want  bool
	}{
		{"529.982.247-25", true},
		{"529.982.247-26", false},
		{"111.111.111-11", false},
		{"abc", false},
		{"", false},
	}
	for _, tt := range tests {
		if got := tools.ValidarCPF(tt.input); got != tt.want {
			t.Errorf("ValidarCPF(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}

func TestGerarCPF(t *testing.T) {
	for i := 0; i < 20; i++ {
		cpf := tools.GerarCPF()
		if !tools.ValidarCPF(cpf) {
			t.Errorf("GerarCPF() = %q: não é válido", cpf)
		}
		if !strings.Contains(cpf, ".") || !strings.Contains(cpf, "-") {
			t.Errorf("GerarCPF() = %q: formato esperado XXX.XXX.XXX-XX", cpf)
		}
	}
}
```

- [ ] **Rodar teste — deve falhar:**

```bash
cd apps/api && go test ./internal/tools/ -run TestValidarCPF -v
```

Expected: `FAIL` — package não existe ainda.

- [ ] **Implementar `apps/api/internal/tools/cpf.go`:**

```go
package tools

import (
	"fmt"
	"math/rand"
	"regexp"
)

func cpfCalcDigit(digits []int, weights []int) int {
	sum := 0
	for i, d := range digits {
		sum += d * weights[i]
	}
	rem := sum % 11
	if rem < 2 {
		return 0
	}
	return 11 - rem
}

func ValidarCPF(value string) bool {
	re := regexp.MustCompile(`\D`)
	digits := re.ReplaceAllString(value, "")
	if len(digits) != 11 {
		return false
	}
	allSame, _ := regexp.MatchString(`^(\d)\1{10}$`, digits)
	if allSame {
		return false
	}
	nums := make([]int, 11)
	for i, c := range digits {
		nums[i] = int(c - '0')
	}
	d1 := cpfCalcDigit(nums[:9], []int{10, 9, 8, 7, 6, 5, 4, 3, 2})
	d2 := cpfCalcDigit(nums[:10], []int{11, 10, 9, 8, 7, 6, 5, 4, 3, 2})
	return nums[9] == d1 && nums[10] == d2
}

func GerarCPF() string {
	d := make([]int, 9)
	for i := range d {
		d[i] = rand.Intn(10)
	}
	d1 := cpfCalcDigit(d, []int{10, 9, 8, 7, 6, 5, 4, 3, 2})
	d = append(d, d1)
	d2 := cpfCalcDigit(d, []int{11, 10, 9, 8, 7, 6, 5, 4, 3, 2})
	d = append(d, d2)
	return fmt.Sprintf("%d%d%d.%d%d%d.%d%d%d-%d%d",
		d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8], d[9], d[10])
}
```

- [ ] **Rodar testes CPF — devem passar:**

```bash
cd apps/api && go test ./internal/tools/ -run "TestValidarCPF|TestGerarCPF" -v
```

Expected: `PASS`.

- [ ] **Escrever teste CNPJ (`apps/api/internal/tools/cnpj_test.go`):**

```go
package tools_test

import (
	"strings"
	"testing"

	"github.com/PiluVitu/api/internal/tools"
)

func TestValidarCNPJ(t *testing.T) {
	tests := []struct {
		input string
		want  bool
	}{
		{"11.222.333/0001-81", true},
		{"11.222.333/0001-82", false},
		{"11.111.111/1111-11", false},
		{"abc", false},
		{"", false},
	}
	for _, tt := range tests {
		if got := tools.ValidarCNPJ(tt.input); got != tt.want {
			t.Errorf("ValidarCNPJ(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}

func TestGerarCNPJ(t *testing.T) {
	for i := 0; i < 20; i++ {
		cnpj := tools.GerarCNPJ()
		if !tools.ValidarCNPJ(cnpj) {
			t.Errorf("GerarCNPJ() = %q: não é válido", cnpj)
		}
		if !strings.Contains(cnpj, "/") {
			t.Errorf("GerarCNPJ() = %q: formato esperado XX.XXX.XXX/XXXX-XX", cnpj)
		}
	}
}
```

- [ ] **Implementar `apps/api/internal/tools/cnpj.go`:**

```go
package tools

import (
	"fmt"
	"math/rand"
	"regexp"
	"strconv"
)

var cnpjWeights1 = []int{5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2}
var cnpjWeights2 = []int{6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2}

func ValidarCNPJ(value string) bool {
	re := regexp.MustCompile(`\D`)
	digits := re.ReplaceAllString(value, "")
	if len(digits) != 14 {
		return false
	}
	allSame, _ := regexp.MatchString(`^(\d)\1{13}$`, digits)
	if allSame {
		return false
	}
	nums := make([]int, 14)
	for i, c := range digits {
		nums[i] = int(c - '0')
	}
	d1 := cpfCalcDigit(nums[:12], cnpjWeights1)
	d2 := cpfCalcDigit(nums[:13], cnpjWeights2)
	return nums[12] == d1 && nums[13] == d2
}

func GerarCNPJ() string {
	base := make([]int, 8)
	for i := range base {
		base[i] = rand.Intn(10)
	}
	all := append(base, 0, 0, 0, 1)
	d1 := cpfCalcDigit(all, cnpjWeights1)
	all = append(all, d1)
	d2 := cpfCalcDigit(all, cnpjWeights2)
	all = append(all, d2)
	s := ""
	for _, n := range all {
		s += strconv.Itoa(n)
	}
	return fmt.Sprintf("%s.%s.%s/%s-%s", s[0:2], s[2:5], s[5:8], s[8:12], s[12:14])
}
```

- [ ] **Rodar todos os testes até aqui:**

```bash
cd apps/api && go test ./internal/tools/ -v
```

Expected: `PASS` CPF e CNPJ.

- [ ] **Commit:**

```bash
git add apps/api/internal/tools/cpf.go apps/api/internal/tools/cpf_test.go
git add apps/api/internal/tools/cnpj.go apps/api/internal/tools/cnpj_test.go
git commit -m "feat(go): add CPF and CNPJ validation and generation"
```

---

### Task 12: Base64, UUID e JSON em Go

**Files:**
- Create: `apps/api/internal/tools/base64.go` + `base64_test.go`
- Create: `apps/api/internal/tools/uuid.go` + `uuid_test.go`
- Create: `apps/api/internal/tools/jsonformat.go` + `jsonformat_test.go`

- [ ] **Escrever testes (`apps/api/internal/tools/base64_test.go`):**

```go
package tools_test

import (
	"testing"

	"github.com/PiluVitu/api/internal/tools"
)

func TestBase64RoundTrip(t *testing.T) {
	inputs := []string{"hello", "PiluVitu Dev", "abc123!@#", ""}
	for _, input := range inputs {
		encoded := tools.EncodeBase64(input)
		decoded, err := tools.DecodeBase64(encoded)
		if err != nil {
			t.Errorf("DecodeBase64(%q) error: %v", encoded, err)
		}
		if decoded != input {
			t.Errorf("round-trip %q → %q → %q", input, encoded, decoded)
		}
	}
}

func TestDecodeBase64Invalid(t *testing.T) {
	_, err := tools.DecodeBase64("not-valid-base64!!!")
	if err == nil {
		t.Error("expected error for invalid base64, got nil")
	}
}
```

- [ ] **Implementar `apps/api/internal/tools/base64.go`:**

```go
package tools

import "encoding/base64"

func EncodeBase64(text string) string {
	return base64.StdEncoding.EncodeToString([]byte(text))
}

func DecodeBase64(encoded string) (string, error) {
	b, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}
	return string(b), nil
}
```

- [ ] **Escrever teste UUID (`apps/api/internal/tools/uuid_test.go`):**

```go
package tools_test

import (
	"regexp"
	"testing"

	"github.com/PiluVitu/api/internal/tools"
)

func TestGenerateUUID(t *testing.T) {
	re := regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	seen := map[string]bool{}
	for i := 0; i < 100; i++ {
		u := tools.GenerateUUID()
		if !re.MatchString(u) {
			t.Errorf("GenerateUUID() = %q: não é UUID v4 válido", u)
		}
		if seen[u] {
			t.Errorf("UUID duplicado: %q", u)
		}
		seen[u] = true
	}
}
```

- [ ] **Implementar `apps/api/internal/tools/uuid.go`:**

```go
package tools

import (
	"crypto/rand"
	"fmt"
)

func GenerateUUID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
```

- [ ] **Escrever teste JSON (`apps/api/internal/tools/jsonformat_test.go`):**

```go
package tools_test

import (
	"testing"

	"github.com/PiluVitu/api/internal/tools"
)

func TestFormatJSON(t *testing.T) {
	result := tools.FormatJSON(`{"b":2,"a":1}`, 2)
	if !result.OK {
		t.Fatalf("FormatJSON: esperado ok=true, got error=%q", result.Error)
	}
	if result.Value == "" {
		t.Error("FormatJSON: valor vazio")
	}
}

func TestFormatJSONInvalid(t *testing.T) {
	result := tools.FormatJSON(`{invalid}`, 2)
	if result.OK {
		t.Error("FormatJSON: esperado ok=false para JSON inválido")
	}
	if result.Error == "" {
		t.Error("FormatJSON: esperado mensagem de erro")
	}
}

func TestMinifyJSON(t *testing.T) {
	result := tools.MinifyJSON(`{ "a" : 1 , "b" : 2 }`)
	if !result.OK || result.Value != `{"a":1,"b":2}` {
		t.Errorf("MinifyJSON: got %+v", result)
	}
}

func TestValidateJSON(t *testing.T) {
	if ok, _ := tools.ValidateJSON(`{"a":1}`); !ok {
		t.Error("ValidateJSON: JSON válido retornou false")
	}
	if ok, msg := tools.ValidateJSON(`{bad}`); ok || msg == "" {
		t.Error("ValidateJSON: JSON inválido retornou true ou sem mensagem")
	}
}
```

- [ ] **Implementar `apps/api/internal/tools/jsonformat.go`:**

```go
package tools

import (
	"encoding/json"
	"strings"
)

type JSONFormatResult struct {
	OK    bool   `json:"ok"`
	Value string `json:"value,omitempty"`
	Error string `json:"error,omitempty"`
}

func FormatJSON(input string, indent int) JSONFormatResult {
	var parsed interface{}
	if err := json.Unmarshal([]byte(input), &parsed); err != nil {
		return JSONFormatResult{OK: false, Error: err.Error()}
	}
	b, err := json.MarshalIndent(parsed, "", strings.Repeat(" ", indent))
	if err != nil {
		return JSONFormatResult{OK: false, Error: err.Error()}
	}
	return JSONFormatResult{OK: true, Value: string(b)}
}

func MinifyJSON(input string) JSONFormatResult {
	var parsed interface{}
	if err := json.Unmarshal([]byte(input), &parsed); err != nil {
		return JSONFormatResult{OK: false, Error: err.Error()}
	}
	b, err := json.Marshal(parsed)
	if err != nil {
		return JSONFormatResult{OK: false, Error: err.Error()}
	}
	return JSONFormatResult{OK: true, Value: string(b)}
}

func ValidateJSON(input string) (bool, string) {
	var parsed interface{}
	if err := json.Unmarshal([]byte(input), &parsed); err != nil {
		return false, err.Error()
	}
	return true, ""
}
```

- [ ] **Rodar testes:**

```bash
cd apps/api && go test ./internal/tools/ -v
```

Expected: todos passam.

- [ ] **Commit:**

```bash
git add apps/api/internal/tools/
git commit -m "feat(go): add Base64, UUID, and JSON format tools"
```

---

### Task 13: JWT decode em Go

**Files:**
- Create: `apps/api/internal/tools/jwt.go` + `jwt_test.go`

- [ ] **Escrever teste (`apps/api/internal/tools/jwt_test.go`):**

```go
package tools_test

import (
	"testing"

	"github.com/PiluVitu/api/internal/tools"
)

const validToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"

func TestDecodeJWT(t *testing.T) {
	parts, err := tools.DecodeJWT(validToken)
	if err != nil {
		t.Fatalf("DecodeJWT error: %v", err)
	}
	if parts.Header["alg"] != "HS256" {
		t.Errorf("header.alg = %v, want HS256", parts.Header["alg"])
	}
	if parts.Payload["sub"] != "1234567890" {
		t.Errorf("payload.sub = %v, want 1234567890", parts.Payload["sub"])
	}
	if parts.Signature == "" {
		t.Error("signature vazia")
	}
}

func TestDecodeJWTInvalid(t *testing.T) {
	_, err := tools.DecodeJWT("apenas.duas")
	if err == nil {
		t.Error("esperado erro para token inválido")
	}
}
```

- [ ] **Rodar — deve falhar:**

```bash
cd apps/api && go test ./internal/tools/ -run TestDecodeJWT -v
```

- [ ] **Implementar `apps/api/internal/tools/jwt.go`:**

```go
package tools

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

type JwtRaw struct {
	Header    string `json:"header"`
	Payload   string `json:"payload"`
	Signature string `json:"signature"`
}

type JwtParts struct {
	Header    map[string]interface{} `json:"header"`
	Payload   map[string]interface{} `json:"payload"`
	Signature string                 `json:"signature"`
	Raw       JwtRaw                 `json:"raw"`
}

func DecodeJWT(token string) (*JwtParts, error) {
	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 3 {
		return nil, errors.New("token inválido: esperado 3 partes separadas por \".\"")
	}
	headerJSON, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("token inválido: não foi possível decodificar header: %w", err)
	}
	payloadJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("token inválido: não foi possível decodificar payload: %w", err)
	}
	var header, payload map[string]interface{}
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		return nil, fmt.Errorf("token inválido: header não é JSON válido: %w", err)
	}
	if err := json.Unmarshal(payloadJSON, &payload); err != nil {
		return nil, fmt.Errorf("token inválido: payload não é JSON válido: %w", err)
	}
	return &JwtParts{
		Header:    header,
		Payload:   payload,
		Signature: parts[2],
		Raw:       JwtRaw{Header: parts[0], Payload: parts[1], Signature: parts[2]},
	}, nil
}
```

- [ ] **Rodar testes:**

```bash
cd apps/api && go test ./internal/tools/ -run TestDecodeJWT -v
```

Expected: `PASS`.

- [ ] **Commit:**

```bash
git add apps/api/internal/tools/jwt.go apps/api/internal/tools/jwt_test.go
git commit -m "feat(go): add JWT decode tool"
```

---

### Task 14: QR encode e QR decode em Go

**Files:**
- Create: `apps/api/internal/tools/qrencode.go` + `qrencode_test.go`
- Create: `apps/api/internal/tools/qrdecode.go` + `qrdecode_test.go`

- [ ] **Escrever teste QR encode (`apps/api/internal/tools/qrencode_test.go`):**

```go
package tools_test

import (
	"bytes"
	"testing"

	"github.com/PiluVitu/api/internal/tools"
)

func TestEncodeQR(t *testing.T) {
	png, err := tools.EncodeQR("https://piluvitu.dev", 256)
	if err != nil {
		t.Fatalf("EncodeQR error: %v", err)
	}
	// PNG magic bytes: 89 50 4E 47
	if !bytes.HasPrefix(png, []byte{0x89, 0x50, 0x4E, 0x47}) {
		t.Errorf("EncodeQR: bytes não correspondem a PNG (got %x...)", png[:4])
	}
}
```

- [ ] **Implementar `apps/api/internal/tools/qrencode.go`:**

```go
package tools

import qrcode "github.com/skip2/go-qrcode"

func EncodeQR(text string, size int) ([]byte, error) {
	return qrcode.Encode(text, qrcode.Medium, size)
}
```

- [ ] **Escrever teste QR decode (`apps/api/internal/tools/qrdecode_test.go`):**

```go
package tools_test

import (
	"testing"

	"github.com/PiluVitu/api/internal/tools"
)

func TestDecodeQRFromBytes(t *testing.T) {
	// Gerar um QR e decodificar para garantir round-trip
	text := "https://piluvitu.dev"
	png, err := tools.EncodeQR(text, 256)
	if err != nil {
		t.Fatalf("EncodeQR error: %v", err)
	}
	decoded, err := tools.DecodeQRFromBytes(png)
	if err != nil {
		t.Fatalf("DecodeQRFromBytes error: %v", err)
	}
	if decoded != text {
		t.Errorf("round-trip: got %q, want %q", decoded, text)
	}
}
```

- [ ] **Implementar `apps/api/internal/tools/qrdecode.go`:**

```go
package tools

import (
	"bytes"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"

	"github.com/makiuchi-d/gozxing"
	"github.com/makiuchi-d/gozxing/qrcode"
)

func DecodeQRFromBytes(imgBytes []byte) (string, error) {
	img, _, err := image.Decode(bytes.NewReader(imgBytes))
	if err != nil {
		return "", fmt.Errorf("não foi possível decodificar imagem: %w", err)
	}
	bmp, err := gozxing.NewBinaryBitmapFromImage(img)
	if err != nil {
		return "", fmt.Errorf("erro ao processar bitmap: %w", err)
	}
	reader := qrcode.NewQRCodeReader()
	result, err := reader.Decode(bmp, nil)
	if err != nil {
		return "", fmt.Errorf("QR code não encontrado na imagem: %w", err)
	}
	return result.GetText(), nil
}
```

- [ ] **Rodar go mod tidy e testes:**

```bash
cd apps/api && go mod tidy && go test ./internal/tools/ -v
```

Expected: todos passam.

- [ ] **Commit:**

```bash
git add apps/api/internal/tools/ apps/api/go.mod apps/api/go.sum
git commit -m "feat(go): add QR encode and decode tools"
```

---

## FASE 5 — HTTP API

### Task 15: Helpers de response e handlers HTTP

**Files:**
- Create: `apps/api/internal/handlers/tools.go`
- Create: `apps/api/internal/handlers/tools_test.go`

- [ ] **Escrever teste de handler CPF (`apps/api/internal/handlers/tools_test.go`):**

```go
package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/PiluVitu/api/internal/handlers"
)

type apiResp struct {
	OK     bool            `json:"ok"`
	Result json.RawMessage `json:"result"`
	Error  string          `json:"error"`
}

func TestValidateCPFHandler(t *testing.T) {
	body := `{"value":"529.982.247-25"}`
	req := httptest.NewRequest(http.MethodPost, "/tools/cpf/validate", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	handlers.ValidateCPF(w, req)
	var resp apiResp
	json.NewDecoder(w.Body).Decode(&resp)
	if !resp.OK {
		t.Fatalf("esperado ok=true")
	}
	var result bool
	json.Unmarshal(resp.Result, &result)
	if !result {
		t.Error("CPF válido retornou false")
	}
}

func TestValidateCPFHandlerInvalid(t *testing.T) {
	body := `{"value":"111.111.111-11"}`
	req := httptest.NewRequest(http.MethodPost, "/tools/cpf/validate", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	handlers.ValidateCPF(w, req)
	var resp apiResp
	json.NewDecoder(w.Body).Decode(&resp)
	if !resp.OK {
		t.Fatalf("handler deve retornar ok=true mesmo para CPF inválido (ok indica sucesso da request)")
	}
	var result bool
	json.Unmarshal(resp.Result, &result)
	if result {
		t.Error("CPF inválido retornou true")
	}
}
```

- [ ] **Rodar teste — deve falhar:**

```bash
cd apps/api && go test ./internal/handlers/ -v
```

- [ ] **Implementar `apps/api/internal/handlers/tools.go`:**

```go
package handlers

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/PiluVitu/api/internal/tools"
)

type apiResponse struct {
	OK     bool   `json:"ok"`
	Result any    `json:"result,omitempty"`
	Error  string `json:"error,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func ok(w http.ResponseWriter, result any) {
	writeJSON(w, http.StatusOK, apiResponse{OK: true, Result: result})
}

func fail(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, apiResponse{OK: false, Error: msg})
}

func readBody(r *http.Request) ([]byte, error) {
	return io.ReadAll(io.LimitReader(r.Body, 1<<20))
}

// CPF

func ValidateCPF(w http.ResponseWriter, r *http.Request) {
	var body struct{ Value string }
	b, _ := readBody(r)
	json.Unmarshal(b, &body)
	ok(w, tools.ValidarCPF(body.Value))
}

func GenerateCPF(w http.ResponseWriter, r *http.Request) {
	ok(w, tools.GerarCPF())
}

// CNPJ

func ValidateCNPJ(w http.ResponseWriter, r *http.Request) {
	var body struct{ Value string }
	b, _ := readBody(r)
	json.Unmarshal(b, &body)
	ok(w, tools.ValidarCNPJ(body.Value))
}

func GenerateCNPJ(w http.ResponseWriter, r *http.Request) {
	ok(w, tools.GerarCNPJ())
}

// Base64

func EncodeBase64(w http.ResponseWriter, r *http.Request) {
	var body struct{ Value string }
	b, _ := readBody(r)
	json.Unmarshal(b, &body)
	ok(w, tools.EncodeBase64(body.Value))
}

func DecodeBase64(w http.ResponseWriter, r *http.Request) {
	var body struct{ Value string }
	b, _ := readBody(r)
	json.Unmarshal(b, &body)
	decoded, err := tools.DecodeBase64(body.Value)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	ok(w, decoded)
}

// JWT

func DecodeJWT(w http.ResponseWriter, r *http.Request) {
	var body struct{ Value string }
	b, _ := readBody(r)
	json.Unmarshal(b, &body)
	parts, err := tools.DecodeJWT(body.Value)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	ok(w, parts)
}

// JSON

func FormatJSON(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Value  string `json:"value"`
		Indent int    `json:"indent"`
	}
	body.Indent = 2
	b, _ := readBody(r)
	json.Unmarshal(b, &body)
	result := tools.FormatJSON(body.Value, body.Indent)
	if !result.OK {
		fail(w, http.StatusBadRequest, result.Error)
		return
	}
	ok(w, result.Value)
}

func MinifyJSON(w http.ResponseWriter, r *http.Request) {
	var body struct{ Value string }
	b, _ := readBody(r)
	json.Unmarshal(b, &body)
	result := tools.MinifyJSON(body.Value)
	if !result.OK {
		fail(w, http.StatusBadRequest, result.Error)
		return
	}
	ok(w, result.Value)
}

func ValidateJSON(w http.ResponseWriter, r *http.Request) {
	var body struct{ Value string }
	b, _ := readBody(r)
	json.Unmarshal(b, &body)
	valid, msg := tools.ValidateJSON(body.Value)
	if !valid {
		ok(w, map[string]any{"valid": false, "error": msg})
		return
	}
	ok(w, map[string]any{"valid": true})
}

// UUID

func GenerateUUID(w http.ResponseWriter, r *http.Request) {
	ok(w, tools.GenerateUUID())
}

// QR

func EncodeQR(w http.ResponseWriter, r *http.Request) {
	var body struct{ Value string }
	b, _ := readBody(r)
	json.Unmarshal(b, &body)
	png, err := tools.EncodeQR(body.Value, 256)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	encoded := tools.EncodeBase64(string(png))
	ok(w, encoded)
}

func DecodeQR(w http.ResponseWriter, r *http.Request) {
	var body struct{ Image string }
	b, _ := readBody(r)
	json.Unmarshal(b, &body)
	imgBytes, err := tools.DecodeBase64(body.Image)
	if err != nil {
		fail(w, http.StatusBadRequest, "imagem base64 inválida")
		return
	}
	text, err := tools.DecodeQRFromBytes([]byte(imgBytes))
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	ok(w, text)
}
```

> Nota: `EncodeQR` handler usa `tools.EncodeBase64(string(png))` para serializar os bytes PNG como base64 na resposta JSON. O cliente envia e recebe imagens como base64.

- [ ] **Rodar testes:**

```bash
cd apps/api && go test ./internal/handlers/ -v
```

Expected: testes CPF passam.

- [ ] **Commit:**

```bash
git add apps/api/internal/handlers/
git commit -m "feat(go): add HTTP handlers for all 8 tools"
```

---

### Task 16: Router chi completo

**Files:**
- Modify: `apps/api/internal/router/router.go`

- [ ] **Atualizar `apps/api/internal/router/router.go` com todas as rotas:**

```go
package router

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/PiluVitu/api/internal/handlers"
)

func New() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok":true}`))
	})

	r.Route("/tools", func(r chi.Router) {
		r.Post("/cpf/validate", handlers.ValidateCPF)
		r.Get("/cpf/generate", handlers.GenerateCPF)
		r.Post("/cnpj/validate", handlers.ValidateCNPJ)
		r.Get("/cnpj/generate", handlers.GenerateCNPJ)
		r.Post("/base64/encode", handlers.EncodeBase64)
		r.Post("/base64/decode", handlers.DecodeBase64)
		r.Post("/jwt/decode", handlers.DecodeJWT)
		r.Post("/json/format", handlers.FormatJSON)
		r.Post("/json/minify", handlers.MinifyJSON)
		r.Post("/json/validate", handlers.ValidateJSON)
		r.Get("/uuid", handlers.GenerateUUID)
		r.Post("/qr/encode", handlers.EncodeQR)
		r.Post("/qr/decode", handlers.DecodeQR)
	})

	return r
}
```

- [ ] **Compilar e testar servidor manualmente:**

```bash
cd apps/api && go build ./cmd/api && ./api &
curl http://localhost:8080/health
curl -s -X POST http://localhost:8080/tools/cpf/validate \
  -H 'Content-Type: application/json' \
  -d '{"value":"529.982.247-25"}' | jq
kill %1
rm api
```

Expected:
```json
{"ok":true,"result":true}
```

- [ ] **Commit:**

```bash
git add apps/api/internal/router/router.go
git commit -m "feat(go): wire all tool routes in chi router"
```

---

## FASE 6 — CLI

### Task 17: CLI com cobra (todos os subcomandos)

**Files:**
- Modify: `apps/api/cmd/cli/main.go`

- [ ] **Substituir `apps/api/cmd/cli/main.go` com todos os subcomandos:**

```go
package main

import (
	"encoding/base64"
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/PiluVitu/api/internal/tools"
)

func main() {
	root := &cobra.Command{
		Use:   "piluvitu",
		Short: "Ferramentas de desenvolvimento da PiluVitu",
	}
	root.AddCommand(cpfCmd(), cnpjCmd(), base64Cmd(), jwtCmd(), jsonCmd(), uuidCmd(), qrCmd())
	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func cpfCmd() *cobra.Command {
	cmd := &cobra.Command{Use: "cpf", Short: "Operações com CPF"}
	cmd.AddCommand(
		&cobra.Command{
			Use:   "validate <número>",
			Short: "Valida um CPF",
			Args:  cobra.ExactArgs(1),
			Run: func(cmd *cobra.Command, args []string) {
				if tools.ValidarCPF(args[0]) {
					fmt.Println("válido")
				} else {
					fmt.Fprintln(os.Stderr, "inválido")
					os.Exit(1)
				}
			},
		},
		&cobra.Command{
			Use:   "generate",
			Short: "Gera um CPF válido",
			Run: func(cmd *cobra.Command, args []string) {
				fmt.Println(tools.GerarCPF())
			},
		},
	)
	return cmd
}

func cnpjCmd() *cobra.Command {
	cmd := &cobra.Command{Use: "cnpj", Short: "Operações com CNPJ"}
	cmd.AddCommand(
		&cobra.Command{
			Use:  "validate <número>",
			Args: cobra.ExactArgs(1),
			Run: func(cmd *cobra.Command, args []string) {
				if tools.ValidarCNPJ(args[0]) {
					fmt.Println("válido")
				} else {
					fmt.Fprintln(os.Stderr, "inválido")
					os.Exit(1)
				}
			},
		},
		&cobra.Command{
			Use: "generate",
			Run: func(cmd *cobra.Command, args []string) {
				fmt.Println(tools.GerarCNPJ())
			},
		},
	)
	return cmd
}

func base64Cmd() *cobra.Command {
	cmd := &cobra.Command{Use: "base64", Short: "Encode/decode Base64"}
	cmd.AddCommand(
		&cobra.Command{
			Use:  "encode <texto>",
			Args: cobra.ExactArgs(1),
			Run: func(cmd *cobra.Command, args []string) {
				fmt.Println(tools.EncodeBase64(args[0]))
			},
		},
		&cobra.Command{
			Use:  "decode <base64>",
			Args: cobra.ExactArgs(1),
			Run: func(cmd *cobra.Command, args []string) {
				result, err := tools.DecodeBase64(args[0])
				if err != nil {
					fmt.Fprintln(os.Stderr, err)
					os.Exit(1)
				}
				fmt.Println(result)
			},
		},
	)
	return cmd
}

func jwtCmd() *cobra.Command {
	cmd := &cobra.Command{Use: "jwt", Short: "Operações com JWT"}
	cmd.AddCommand(&cobra.Command{
		Use:   "decode <token>",
		Short: "Decodifica um JWT (sem verificar assinatura)",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			parts, err := tools.DecodeJWT(args[0])
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			result := tools.FormatJSON(
				fmt.Sprintf(`{"header":%s,"payload":%s}`,
					mustMarshal(parts.Header), mustMarshal(parts.Payload)),
				2)
			fmt.Println(result.Value)
		},
	})
	return cmd
}

func jsonCmd() *cobra.Command {
	var indent int
	cmd := &cobra.Command{Use: "json", Short: "Operações com JSON"}
	formatCmd := &cobra.Command{
		Use:   "format",
		Short: "Formata JSON da stdin",
		Run: func(cmd *cobra.Command, args []string) {
			input, _ := os.ReadFile("/dev/stdin")
			result := tools.FormatJSON(string(input), indent)
			if !result.OK {
				fmt.Fprintln(os.Stderr, result.Error)
				os.Exit(1)
			}
			fmt.Println(result.Value)
		},
	}
	formatCmd.Flags().IntVar(&indent, "indent", 2, "tamanho da indentação")
	cmd.AddCommand(formatCmd)
	return cmd
}

func uuidCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "uuid",
		Short: "Gera UUID v4",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Println(tools.GenerateUUID())
		},
	}
}

func qrCmd() *cobra.Command {
	var outFile string
	cmd := &cobra.Command{Use: "qr", Short: "Operações com QR code"}

	encodeCmd := &cobra.Command{
		Use:  "encode <texto>",
		Args: cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			png, err := tools.EncodeQR(args[0], 256)
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			if outFile != "" {
				os.WriteFile(outFile, png, 0644)
				fmt.Printf("QR salvo em %s\n", outFile)
			} else {
				fmt.Println(base64.StdEncoding.EncodeToString(png))
			}
		},
	}
	encodeCmd.Flags().StringVarP(&outFile, "out", "o", "", "arquivo de saída PNG")

	decodeCmd := &cobra.Command{
		Use:  "decode <arquivo.png>",
		Args: cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			imgBytes, err := os.ReadFile(args[0])
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			text, err := tools.DecodeQRFromBytes(imgBytes)
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			fmt.Println(text)
		},
	}

	cmd.AddCommand(encodeCmd, decodeCmd)
	return cmd
}

func mustMarshal(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}
```

- [ ] **Compilar e testar CLI manualmente:**

```bash
cd apps/api && go build ./cmd/cli -o piluvitu
./piluvitu cpf generate
./piluvitu cpf validate "529.982.247-25"
./piluvitu uuid
./piluvitu base64 encode "hello world"
rm piluvitu
```

Expected:
```
$ ./piluvitu cpf validate "529.982.247-25"
válido
$ ./piluvitu uuid
f47ac10b-58cc-4372-a567-0e02b2c3d479
```

- [ ] **Commit:**

```bash
git add apps/api/cmd/cli/main.go
git commit -m "feat(go): add cobra CLI with all 8 tool subcommands"
```

---

## FASE 7 — Docker e Makefile

### Task 18: Dockerfiles

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`

- [ ] **Criar `apps/api/Dockerfile`:**

```dockerfile
# Build stage
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download
COPY apps/api/ .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/api ./cmd/api
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/piluvitu ./cmd/cli

# Final stage
FROM gcr.io/distroless/static-debian12
COPY --from=builder /bin/api /api
EXPOSE 8080
CMD ["/api"]
```

- [ ] **Garantir `output: 'standalone'` em `apps/web/next.config.mjs`** — necessário para o Dockerfile de produção:

```js
// apps/web/next.config.mjs — adicionar dentro do objeto de config:
output: 'standalone',
```

- [ ] **Criar `apps/web/Dockerfile`:**

```dockerfile
FROM node:22-alpine AS base
RUN npm install -g pnpm@latest

FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/tools/package.json ./packages/tools/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/tools/node_modules ./packages/tools/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
RUN pnpm --filter @piluvitu/web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3333
CMD ["node", "apps/web/server.js"]
```

- [ ] **Commit:**

```bash
git add apps/api/Dockerfile apps/web/Dockerfile
git commit -m "feat: add Docker multi-stage builds for api and web"
```

---

### Task 19: docker-compose e Makefile

**Files:**
- Create: `infra/docker-compose.yml`
- Create: `infra/docker-compose.test.yml`
- Create: `infra/seed/data.json`
- Create: `Makefile`

- [ ] **Criar `infra/docker-compose.yml`:**

```yaml
services:
  api:
    build:
      context: ..
      dockerfile: apps/api/Dockerfile
    ports:
      - "8080:8080"
    environment:
      PORT: "8080"

  web:
    build:
      context: ..
      dockerfile: apps/web/Dockerfile
    ports:
      - "3333:3333"
    environment:
      NEXT_PUBLIC_API_URL: "http://api:8080"
    depends_on:
      - api
```

- [ ] **Criar `infra/docker-compose.test.yml`:**

```yaml
services:
  api-test:
    build:
      context: ..
      dockerfile: apps/api/Dockerfile
    environment:
      PORT: "8081"
      GO_ENV: "test"
    ports:
      - "8081:8081"
```

- [ ] **Criar `infra/seed/data.json`:**

```json
{
  "_comment": "Seed data placeholder — adicionar entradas quando houver banco de dados"
}
```

- [ ] **Criar `Makefile` na raiz:**

```makefile
.PHONY: dev dev-web dev-api build-api build-cli test lint clean

dev-web:
	pnpm --filter @piluvitu/web dev

dev-api:
	cd apps/api && go run ./cmd/api

dev:
	make -j2 dev-web dev-api

build-api:
	cd apps/api && go build -o ../../bin/api ./cmd/api

build-cli:
	cd apps/api && go build -o ../../bin/piluvitu ./cmd/cli

test:
	pnpm -r test && cd apps/api && go test ./...

test-go:
	cd apps/api && go test ./... -v

test-web:
	pnpm --filter @piluvitu/web test

test-e2e:
	pnpm --filter @piluvitu/web test:e2e

lint:
	pnpm -r lint && cd apps/api && go vet ./...

clean:
	rm -rf bin/ apps/api/api apps/api/piluvitu
```

- [ ] **Criar diretório bin no .gitignore:**

Adicionar ao `.gitignore` raiz:
```
/bin/
apps/api/api
apps/api/piluvitu
```

- [ ] **Commit:**

```bash
mkdir -p infra/seed
git add infra/ Makefile .gitignore
git commit -m "feat: add docker-compose, Makefile, and infra scaffolding"
```

---

## FASE 8 — Ajustes finais

### Task 20: Atualizar CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Atualizar a seção "Commands" no CLAUDE.md** — refletir nova estrutura de comandos:

```markdown
## Commands

Todos os comandos rodam da raiz do monorepo usando **pnpm** ou **make**.

| Comando | Propósito |
|---|---|
| `make dev` | Dev server web + Go API em paralelo |
| `make dev-web` | Só o Next.js em http://localhost:3333 |
| `make dev-api` | Só a Go API em http://localhost:8080 |
| `make build-api` | Compila binário Go API em bin/api |
| `make build-cli` | Compila CLI Go em bin/piluvitu |
| `make test` | Todos os testes (pnpm -r test + go test) |
| `make lint` | ESLint + go vet |
| `pnpm --filter @piluvitu/web dev` | Dev Next.js direto |
| `pnpm --filter @piluvitu/web build` | Build Next.js |
| `pnpm --filter @piluvitu/web storybook` | Storybook em 6017 |
| `pnpm --filter @piluvitu/web test:e2e` | Playwright E2E |
| `pnpm -r test` | Testes de todos os workspaces |
```

- [ ] **Atualizar seção "Colocation rules"** no CLAUDE.md — adicionar:

```markdown
## Colocation rules (lei do projeto)

Todo teste e story fica no mesmo diretório do arquivo fonte. Jamais em `stories/` ou `e2e/` separados.

| Camada | Fonte | Teste | Story |
|---|---|---|---|
| Componente React | `bio.tsx` | `bio.test.tsx` | `bio.stories.tsx` |
| Página Next.js | `page.tsx` | `page.test.tsx` | `page.stories.tsx` |
| Lib TS pura | `cpf.ts` | `cpf.test.ts` | — |
| Handler Go | `tools.go` | `tools_test.go` | — |
| Lib Go pura | `cpf.go` | `cpf_test.go` | — |
```

- [ ] **Commit final:**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for monorepo structure and colocation rules"
```

---

### Task 21: Verificação final de integridade

- [ ] **Rodar todos os testes:**

```bash
make test
```

Expected: testes TypeScript (@piluvitu/tools e @piluvitu/web) + testes Go todos passando.

- [ ] **Verificar build Go:**

```bash
make build-api build-cli
ls bin/
```

Expected: `bin/api` e `bin/piluvitu`.

- [ ] **Verificar build Next.js:**

```bash
pnpm --filter @piluvitu/web build
```

Expected: build limpo.

- [ ] **Smoke test da API Go:**

```bash
./bin/api &
sleep 1
curl http://localhost:8080/health
curl -s -X POST http://localhost:8080/tools/uuid | jq
curl -s -X POST http://localhost:8080/tools/cpf/generate | jq
kill %1
```

Expected: respostas JSON com `"ok": true`.

- [ ] **Smoke test do CLI:**

```bash
./bin/piluvitu cpf generate
./bin/piluvitu cnpj generate
./bin/piluvitu uuid
./bin/piluvitu base64 encode "PiluVitu Dev"
```

- [ ] **Ação manual necessária — Vercel:** No dashboard da Vercel, mudar **Root Directory** de `.` para `apps/web`.

- [ ] **Commit de fechamento:**

```bash
rm -f bin/api bin/piluvitu
git add -A
git commit -m "chore: final cleanup and verification — monorepo complete"
```

---

## Resumo das fases

| Fase | Tarefas | Resultado |
|---|---|---|
| 1 — packages/tools | 1-3 | @piluvitu/tools isolado, testes passando |
| 2 — apps/web | 4-9 | Next.js em apps/web, colocation completa, build ok |
| 3 — Go scaffold | 10 | apps/api compila, router stub, go.work |
| 4 — Go tools | 11-14 | 8 ferramentas com testes unitários Go |
| 5 — HTTP API | 15-16 | 13 endpoints funcionando, smoke tested |
| 6 — CLI | 17 | Binário `piluvitu` com todos os subcomandos |
| 7 — Infra | 18-19 | Dockerfiles + docker-compose + Makefile |
| 8 — Cleanup | 20-21 | CLAUDE.md atualizado, verificação final |
