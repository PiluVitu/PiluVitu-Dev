# Admin Unificado — Slice ⑤ (Votação na shell + delete do editor Keystatic) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover o painel admin da votação pro shell `/admin` em `/admin/sessoes` (reusando os componentes DS V2 existentes) e remover o **editor** Keystatic (UI + API routes + campos só-editor + deps `@keystatic/next`/`@keystar/ui`), mantendo o **reader** que alimenta o site público.

**Architecture:** Parte A re-hospeda quatro componentes de votação já prontos numa nova página dentro do route group `(admin)` (que já provê providers + gate `is_admin`), troca o `/votacao/admin` antigo por um redirect e repõe um link. Parte B decopla o `keystatic.config.ts` dos arquivos de campo do editor (troca o campo custom por `fields.select` built-in, mesmo shape de leitura), depois apaga os arquivos do editor + 2 deps, limpa envs e docs. O reader (`@keystatic/core/reader`) e o site público ficam intocados.

**Tech Stack:** Next.js 16 App Router (route groups, `redirect()`), React 19, TanStack Query, Keystatic 0.5 (`@keystatic/core` reader-only após o slice), Playwright E2E (mocks host-agnósticos).

**Branch:** `feat/admin-unificado-votacao` (criado de `origin/main`). O slice ④ (#39) ainda está aberto; slice ⑤ **não toca** nenhum arquivo do #39 (mídia), então é independente. Na execução: **mergear #39 primeiro**, depois rebasar este branch em `main` e executar.

**Spec:** `docs/superpowers/specs/2026-06-04-admin-unificado-votacao-slice5-design.md`

---

## File Structure

**Parte A — Fold (criar/modificar):**

- `apps/web/app/(admin)/admin/sessoes/page.tsx` — **criar**: página client que compõe `CreateSessionForm`/`SessionsManager`/`UsersTable`/`BackupsPanel` com `SectionHeader`. Sem gate próprio (o shell gateia).
- `apps/web/app/(site)/votacao/admin/page.tsx` — **substituir** o conteúdo por um redirect server-side pra `/admin/sessoes`.
- `apps/web/app/(site)/votacao/page.tsx` — **modificar** linha 41: link `/votacao/admin` → `/admin/sessoes`.
- `apps/web/app/(admin)/admin/sessoes/sessoes.e2e.ts` — **criar**: E2E (mocks shell + votação admin).
- `apps/web/app/(site)/votacao/votacao.e2e.ts` — **modificar**: remover o describe `/votacao/admin dashboard`; atualizar o teste do link.

**Parte B — Delete editor (modificar/apagar):**

- `apps/web/keystatic.config.ts` — **modificar**: campo custom → `fields.select`, remover import.
- `apps/web/app/keystatic/**`, `apps/web/app/api/keystatic/**` — **apagar**.
- `apps/web/lib/keystatic-fa-icon-picker-input.tsx`, `apps/web/lib/keystatic-fontawesome-icon-select-field.tsx` — **apagar**.
- `apps/web/package.json` — **modificar**: remover `@keystatic/next` + `@keystar/ui`.
- `.env.example`, `apps/web/.env.example` — **modificar**: remover 4 envs OAuth.
- `CLAUDE.md` — **modificar**: Tech Stack / Architecture / Font Awesome / Admin unificado / env vars / Keystatic deployment.

**Nota de testes:** não há lógica pura nova (é re-hospedagem + deleção), então a verificação é E2E (Tasks 3) + o **build (`build:ci`)** como gate de integração (Task 7), além de `tsc`/`lint`/`jest` existentes. Não inventar unit tests sem unidade testável (YAGNI).

---

## Task 1: Página `/admin/sessoes`

**Files:**

- Create: `apps/web/app/(admin)/admin/sessoes/page.tsx`

- [ ] **Step 1: Criar a página** (reuso dos componentes; sem gate próprio — o `(admin)/admin/layout.tsx` já barra não-admin)

```tsx
'use client'

import { toast } from 'sonner'
import { SectionHeader } from '@/components/section-header'
import { CreateSessionForm } from '@/components/votacao/create-session-form'
import { SessionsManager } from '@/components/votacao/sessions-manager'
import { UsersTable } from '@/components/votacao/admin/users-table'
import { BackupsPanel } from '@/components/votacao/admin/backups-panel'
import { useCurrentUser } from '@/hooks/votacao/use-current-user'
import { useAdminUsers } from '@/hooks/votacao/use-admin-users'
import {
  useAdminBackups,
  useCreateBackup,
} from '@/hooks/votacao/use-admin-backups'
import { errorMessage } from '@/lib/votacao/api-client'

export default function SessoesPage() {
  const user = useCurrentUser()
  const isAdmin = !!user.data?.is_admin

  // O shell (admin)/layout.tsx já bloqueia não-admin. Este gate mantém as
  // queries admin honestas (enabled=false) pra não dispararem antes do user
  // resolver / pra não-admin.
  const users = useAdminUsers(isAdmin)
  const backups = useAdminBackups(isAdmin)
  const createBackup = useCreateBackup()

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SectionHeader label="Nova sessão" />
        <CreateSessionForm />
      </section>

      <section className="space-y-3">
        <SectionHeader label="Sessões" />
        <SessionsManager />
      </section>

      <section className="space-y-3">
        <SectionHeader label="Usuários" count={users.data?.users?.length} />
        <UsersTable
          users={users.data?.users ?? []}
          isLoading={users.isLoading}
        />
      </section>

      <section className="space-y-3">
        <SectionHeader label="Backups" />
        <BackupsPanel
          backups={backups.data?.backups ?? []}
          isLoading={backups.isLoading}
          backingUp={createBackup.isPending}
          onBackup={() =>
            createBackup.mutate(undefined, {
              onSuccess: () => toast.success('Backup executado'),
              onError: (err) => toast.error(errorMessage(err)),
            })
          }
        />
      </section>
    </div>
  )
}
```

> Referência: a versão antiga (`app/(site)/votacao/admin/page.tsx`) tinha o mesmo wiring porém com gate/loading próprios e `<main>`/`<header>` do site; aqui a casca vem do shell e os títulos viram `SectionHeader`. As props de `UsersTable` (`users`, `isLoading`) e `BackupsPanel` (`backups`, `isLoading`, `backingUp`, `onBackup`) são idênticas às já usadas.

- [ ] **Step 2: Type-check + lint**

Run: `cd apps/web && pnpm exec tsc --noEmit && pnpm lint`
Expected: sem erros. (Se `SectionHeader` não aceitar `count` undefined — aceita: `count?: number | string`, `padCount(undefined)` retorna undefined e não renderiza.)

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(admin)/admin/sessoes/page.tsx"
git commit -m "feat(admin): página /admin/sessoes reusando o painel da votação"
```

---

## Task 2: Redirect do `/votacao/admin` + repontar o link

**Files:**

- Modify (substituir conteúdo): `apps/web/app/(site)/votacao/admin/page.tsx`
- Modify: `apps/web/app/(site)/votacao/page.tsx:41`

- [ ] **Step 1: Substituir `app/(site)/votacao/admin/page.tsx` por um redirect**

Apague todo o conteúdo atual do arquivo e substitua por (server component, sem `'use client'`):

```tsx
import { redirect } from 'next/navigation'

// O painel admin migrou pro shell unificado /admin/sessoes (slice ⑤).
// Mantemos esta rota viva como redirect pra bookmarks/links antigos.
export default function VotacaoAdminRedirect() {
  redirect('/admin/sessoes')
}
```

- [ ] **Step 2: Repontar o link admin em `app/(site)/votacao/page.tsx`**

Linha ~41 — trocar o `href`:

```tsx
// de:
<Link
  href="/votacao/admin"
  className="hover:text-primary text-sm underline underline-offset-4 transition-colors"
>
  Painel admin
</Link>
// para:
<Link
  href="/admin/sessoes"
  className="hover:text-primary text-sm underline underline-offset-4 transition-colors"
>
  Painel admin
</Link>
```

(Só o `href` muda; o resto fica. O link segue dentro do `user.data.is_admin && (...)`.)

- [ ] **Step 3: Type-check + lint**

Run: `cd apps/web && pnpm exec tsc --noEmit && pnpm lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(site)/votacao/admin/page.tsx" "apps/web/app/(site)/votacao/page.tsx"
git commit -m "feat(admin): /votacao/admin redireciona pra /admin/sessoes + repontar link"
```

---

## Task 3: E2E — mover o painel pro `sessoes.e2e.ts` + ajustar `votacao.e2e.ts`

**Files:**

- Create: `apps/web/app/(admin)/admin/sessoes/sessoes.e2e.ts`
- Modify: `apps/web/app/(site)/votacao/votacao.e2e.ts`

- [ ] **Step 1: Criar `sessoes.e2e.ts`**

A página vive no shell `(admin)`, que renderiza sidebar (usa `useAdminStats` → `**/api/admin/stats`, `useSessionsCount` → `**/votacao/sessions`, status do GitHub → `**/api/admin/github/status`) e gateia `is_admin` via `**/auth/me`. Os mocks abaixo combinam os do shell (espelhando `midia.e2e.ts`) com os do painel de votação (espelhando o `mockAPI` de `votacao.e2e.ts`).

```ts
import { test, expect, type Page } from '@playwright/test'

// Rotas casadas host-agnosticamente (`**/path`) → independem de NEXT_PUBLIC_API_URL.
type Notification = {
  type: 'error' | 'warning' | 'success' | 'info'
  code?: string
  message: string
}
function envelope(data: unknown, notifications: Notification[] = []) {
  return JSON.stringify({ ok: true, data, notifications })
}

const adminUser = {
  id: 1,
  email: 'admin@example.com',
  name: 'Admin',
  picture: '',
  is_admin: true,
}
const session = {
  ID: 1,
  Title: 'Sexta 22/05',
  Status: 'open' as const,
  CreatedBy: 1,
  CreatedAt: '2026-05-22T00:00:00.000Z',
  ClosedAt: null,
  WinnerMovieID: null,
  WinnerMethod: null,
  SortOptionsJSON: '{}',
}
const adminUsers = [
  {
    id: 1,
    name: 'Admin',
    email: 'admin@example.com',
    picture: '',
    is_admin: true,
    created_at: '2026-05-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: 'Maria S.',
    email: 'maria@example.com',
    picture: '',
    is_admin: false,
    created_at: '2026-05-02T00:00:00.000Z',
  },
]
const backups = [
  {
    ID: 1,
    DriveFileID: 'f1',
    DriveFileName: 'votacao.db',
    SizeBytes: 1_200_000,
    TriggerType: 'manual' as const,
    CreatedAt: '2026-05-22T03:00:00.000Z',
  },
]
const sessionVotes = [
  {
    user_id: 1,
    user_name: 'Admin',
    user_email: 'admin@example.com',
    movie_id: 1,
    movie_title: 'A Coisa',
    category: 'terror',
    created_at: '2026-05-22T01:00:00.000Z',
  },
]

async function baseMocks(page: Page, opts: { isAdmin?: boolean } = {}) {
  const { isAdmin = true } = opts
  // --- shell ---
  await page.route('**/auth/me', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: envelope({ ...adminUser, is_admin: isAdmin }),
    }),
  )
  await page.route('**/api/admin/stats', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        posts: 0,
        drafts: 0,
        published: 0,
        projects: 0,
        careers: 0,
        careersCurrent: 0,
        recentPosts: [],
      }),
    }),
  )
  await page.route('**/api/admin/github/status', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ linked: true, login: 'piluvitu' }),
    }),
  )
  // --- votação ---
  await page.route('**/votacao/sessions', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: envelope({ sessions: [session] }),
    }),
  )
  await page.route('**/votacao/sessions/1/votes', (r) => {
    if (r.request().method() === 'GET') {
      r.fulfill({
        contentType: 'application/json',
        body: envelope({ votes: sessionVotes, total: sessionVotes.length }),
      })
      return
    }
    r.fulfill({
      contentType: 'application/json',
      body: envelope({ voted_movie_ids: [] }),
    })
  })
  await page.route('**/votacao/sessions/1', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: envelope({
        session,
        movies: [
          {
            ID: 1,
            SessionID: 1,
            Category: 'terror',
            Title: 'A Coisa',
            Type: 'filme',
            PosterURL: '',
            TMDbID: 550,
            WasWatched: false,
            SheetNumber: 1,
          },
        ],
        has_voted: false,
        voted_movie_ids: [],
      }),
    }),
  )
  await page.route('**/admin/users', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: envelope({ users: adminUsers }),
    }),
  )
  await page.route('**/admin/backups', (r) =>
    r.fulfill({ contentType: 'application/json', body: envelope({ backups }) }),
  )
}

test.describe('/admin/sessoes', () => {
  test('mostra as quatro seções do painel pra admin', async ({ page }) => {
    await baseMocks(page)
    await page.goto('/admin/sessoes')
    await expect(page.getByText('Nova sessão')).toBeVisible()
    await expect(page.getByText('Sexta 22/05')).toBeVisible() // SessionsManager
    await expect(page.getByText('maria@example.com')).toBeVisible() // UsersTable
    await expect(page.getByText(/fazer backup agora/i)).toBeVisible() // BackupsPanel
  })

  test('expande uma sessão pra ver quem votou', async ({ page }) => {
    await baseMocks(page)
    await page.goto('/admin/sessoes')
    await page.getByRole('button', { name: /ver votos/i }).click()
    await expect(page.getByText('A Coisa')).toBeVisible()
  })

  test('o redirect de /votacao/admin chega em /admin/sessoes', async ({
    page,
  }) => {
    await baseMocks(page)
    await page.goto('/votacao/admin')
    await expect(page).toHaveURL(/\/admin\/sessoes$/)
    await expect(page.getByText('Nova sessão')).toBeVisible()
  })

  test('bloqueia não-admin (gate do shell)', async ({ page }) => {
    await baseMocks(page, { isAdmin: false })
    await page.goto('/admin/sessoes')
    await expect(page.getByText(/acesso negado/i)).toBeVisible()
  })
})
```

> Verifique os textos exatos contra os componentes reais: `BackupsPanel` ("fazer backup agora"), `SessionsManager` (botão "ver votos"), e a mensagem do gate do shell ("Acesso negado"). Se algum diverge, ajuste o seletor (não o componente). O texto do gate vem de `app/(admin)/admin/layout.tsx` — leia pra confirmar a string.

- [ ] **Step 2: Remover o bloco `/votacao/admin dashboard` de `votacao.e2e.ts`**

Apague o `test.describe('/votacao/admin dashboard', () => { ... })` inteiro (os 3 testes: lists registered users and backups / expands a session / blocks non-admins) — eles foram migrados pro `sessoes.e2e.ts`.

- [ ] **Step 3: Atualizar o teste do link admin em `votacao.e2e.ts`**

No `test('admin sees painel link', ...)`, trocar a asserção de visibilidade por uma que confirma o destino novo:

```ts
test('admin sees painel link', async ({ page }) => {
  await mockAPI(page)
  await page.goto('/votacao')
  await expect(
    page.getByRole('link', { name: /painel admin/i }),
  ).toHaveAttribute('href', '/admin/sessoes')
})
```

- [ ] **Step 4: Rodar os E2E afetados**

Run: `cd apps/web && pnpm test:e2e sessoes.e2e.ts votacao.e2e.ts`
Expected: todos passam. (Se o dev server não subir no ambiente, reporte; senão garanta tsc/lint verdes.)

- [ ] **Step 5: Type-check + lint + commit**

```bash
cd apps/web && pnpm exec tsc --noEmit && pnpm lint
git add "apps/web/app/(admin)/admin/sessoes/sessoes.e2e.ts" "apps/web/app/(site)/votacao/votacao.e2e.ts"
git commit -m "test(admin): E2E do /admin/sessoes + ajuste do votacao.e2e (link/redirect)"
```

---

## Task 4: Decoplar `keystatic.config.ts` do editor (campo custom → `fields.select`)

**Files:**

- Modify: `apps/web/keystatic.config.ts` (import na linha 2; campos `fontawesomeIcon` ~linhas 146 e 191)

> **Por que `fields.select` e não `fields.text`:** o campo custom valida o valor contra o conjunto de opções no reader (lança "Must be a valid option"). `fields.select` (built-in do `@keystatic/core`, que **fica**) preserva exatamente essa semântica de leitura e tipa `defaultValue` como `string` (porque `VISIT_CARD_FA_SELECT_OPTIONS` tem `value: string`), evitando atrito de TS. Isso refina a spec (que dizia `fields.text`) mantendo o mesmo shape de leitura e descartando o `@keystar/ui`.

- [ ] **Step 1: Remover o import do campo custom**

Apague a linha 2:

```ts
import { fontawesomeIconSelectField } from './lib/keystatic-fontawesome-icon-select-field'
```

Mantenha a linha 3 (`import { VISIT_CARD_FA_SELECT_OPTIONS } from './lib/visit-card-fontawesome'`) e a linha 1 (`import { collection, config, fields, singleton } from '@keystatic/core'`).

- [ ] **Step 2: Trocar o campo `fontawesomeIcon` do visit-card (~linha 146)**

```ts
// de:
fontawesomeIcon: fontawesomeIconSelectField({
  label: 'Ícone Font Awesome',
  description:
    'Pré-visualização ao vivo: abre /keystatic/icon-preview no mesmo site. Documentação: https://docs.fontawesome.com/web/use-with/react/',
  defaultValue: 'brands__github',
  options: VISIT_CARD_FA_SELECT_OPTIONS,
}),
// para:
fontawesomeIcon: fields.select({
  label: 'Ícone Font Awesome',
  description: 'Edição agora no /admin/socials.',
  defaultValue: 'brands__github',
  options: VISIT_CARD_FA_SELECT_OPTIONS,
}),
```

- [ ] **Step 3: Trocar o campo `fontawesomeIcon` dos socials (~linha 191)**

```ts
// de:
fontawesomeIcon: fontawesomeIconSelectField({
  label: 'Ícone Font Awesome',
  description:
    'Se o tipo for Font Awesome. Pré-visualização: /keystatic/icon-preview',
  defaultValue: 'brands__github',
  options: VISIT_CARD_FA_SELECT_OPTIONS,
}),
// para:
fontawesomeIcon: fields.select({
  label: 'Ícone Font Awesome',
  description: 'Se o tipo for Font Awesome. Edição no /admin/socials.',
  defaultValue: 'brands__github',
  options: VISIT_CARD_FA_SELECT_OPTIONS,
}),
```

- [ ] **Step 4: Type-check**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: sem erros. Se TS reclamar que `defaultValue: 'brands__github'` não casa com o tipo das options, confirme que `VISIT_CARD_FA_SELECT_OPTIONS` tem `value: string` (e não um union literal restrito); se for o caso, ajuste a tipagem da constante pra incluir `'brands__github'`. (Esperado: sem reclamação — `value` é `string`.)

- [ ] **Step 5: Smoke do reader (não quebrou a leitura)**

O `keystatic-fontawesome-icon-select-field.tsx` ainda existe neste ponto (apaga na Task 5), mas o config já não o importa. Confirme que nada mais o importa antes de prosseguir:

Run: `cd apps/web && grep -rn "keystatic-fontawesome-icon-select-field\|fontawesomeIconSelectField" --include=*.ts --include=*.tsx . | grep -v "keystatic-fontawesome-icon-select-field.tsx:"`
Expected: vazio (nenhum consumidor remanescente fora do próprio arquivo).

- [ ] **Step 6: Commit**

```bash
git add apps/web/keystatic.config.ts
git commit -m "refactor(keystatic): campo FA custom → fields.select (decopla do editor, mantém leitura)"
```

---

## Task 5: Apagar os arquivos do editor + remover deps

**Files:**

- Delete: `apps/web/app/keystatic/` (dir), `apps/web/app/api/keystatic/` (dir), `apps/web/lib/keystatic-fa-icon-picker-input.tsx`, `apps/web/lib/keystatic-fontawesome-icon-select-field.tsx`
- Modify: `apps/web/package.json` (remover `@keystar/ui` e `@keystatic/next`)

- [ ] **Step 1: Apagar os arquivos do editor**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/web
git rm -r app/keystatic app/api/keystatic
git rm lib/keystatic-fa-icon-picker-input.tsx lib/keystatic-fontawesome-icon-select-field.tsx
```

- [ ] **Step 2: Remover as 2 deps do `package.json`**

Em `apps/web/package.json`, apague as linhas:

```json
"@keystar/ui": "0.7.19",
"@keystatic/next": "^5.0.4",
```

**Mantenha** `"@keystatic/core": "^0.5.48",` (o reader usa).

- [ ] **Step 3: Atualizar o lockfile**

Run (da raiz do monorepo): `pnpm install`
Expected: `pnpm-lock.yaml` atualizado removendo `@keystar/ui` e `@keystatic/next` (e transitivas órfãs). CI roda `--frozen-lockfile`, então o lockfile atualizado **precisa** ser commitado.

> Regra do projeto: `pnpm install` aqui é manutenção de dependências (não migration). Rode e commite o lockfile junto.

- [ ] **Step 4: Type-check + lint (confirma que nada importava os arquivos apagados)**

Run: `cd apps/web && pnpm exec tsc --noEmit && pnpm lint`
Expected: sem erros (o Task 4 já decoplou o config; nada mais importava o editor).

- [ ] **Step 5: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(keystatic): apaga o editor (routes + campos) + remove @keystatic/next e @keystar/ui"
```

(O `git rm` da Step 1 já staged as deleções; o commit acima inclui package.json + lockfile. Se preferir, `git add -A apps/web/app/keystatic apps/web/app/api/keystatic` não é necessário — `git rm` já registrou.)

---

## Task 6: Limpar env vars + verificar órfãos

**Files:**

- Modify: `.env.example` (raiz), `apps/web/.env.example`

- [ ] **Step 1: Remover os 4 envs OAuth do editor**

Em **`.env.example`** (raiz) e **`apps/web/.env.example`**, apague as linhas destes 4 (e comentários associados):

```
KEYSTATIC_GITHUB_CLIENT_ID=
KEYSTATIC_GITHUB_CLIENT_SECRET=
KEYSTATIC_SECRET=
NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG=
```

**Mantenha** `KEYSTATIC_GITHUB_REPO=` (reader + admin backend usam).

> Se algum dos arquivos não tiver todas as 4 chaves, remova as que existirem. Confirme antes: `grep -n "KEYSTATIC" .env.example apps/web/.env.example`.

- [ ] **Step 2: Verificar que não sobrou referência aos arquivos/deps apagados**

Run:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/web
grep -rn "@keystatic/next\|@keystar/ui\|keystatic-fa-icon-picker-input\|keystatic-fontawesome-icon-select-field\|/keystatic/icon-preview" --include=*.ts --include=*.tsx --include=*.mjs --include=*.json . || echo "CLEAN"
```

Expected: `CLEAN` (ou só ocorrências em arquivos de doc/markdown que serão tratados na Task 7). Nenhuma em `.ts/.tsx/.mjs/.json` de código.

- [ ] **Step 3: Confirmar que `next.config.mjs` não referencia o editor**

Run: `grep -n "keystatic\|Keystatic" next.config.mjs`
Expected: só o comentário reader-related ("Keystatic lê YAML em runtime…") — **manter** (o reader segue lendo YAML em runtime). Nenhum import de `@keystatic/next`.

- [ ] **Step 4: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev
git add .env.example apps/web/.env.example
git commit -m "chore(env): remove os 4 envs OAuth do editor Keystatic (mantém KEYSTATIC_GITHUB_REPO)"
```

---

## Task 7: Docs (CLAUDE.md) + verificação completa

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Atualizar a Tech Stack (linha ~9)**

```markdown
// de:

- **Keystatic 0.5** — GitHub-based CMS; content stored as YAML in `content/` (site config, socials, careers, projects)
  // para:
- **Keystatic 0.5 (reader-only)** — lê o conteúdo YAML em `content/` no build/ISR via `@keystatic/core/reader` (`lib/keystatic-reader.ts` → `lib/site-content.ts`). O **editor** `/keystatic` foi removido no slice ⑤; a edição agora é no `/admin` unificado.
```

- [ ] **Step 2: Atualizar "App Router structure" (linhas ~67-68)**

Remova as duas linhas do editor:

```markdown
- `app/api/keystatic/` — Keystatic CMS API routes
- `app/keystatic/` — Keystatic editor UI + `/icon-preview` page (shows all selectable FA icons)
```

(Mantenha as outras linhas da seção.)

- [ ] **Step 3: Reescrever "Font Awesome in the CMS" (linhas ~105-107)**

```markdown
### Font Awesome no conteúdo

Os ícones disponíveis vivem em `lib/visit-card-fontawesome.ts` (`VISIT_CARD_FA_ICON_MAP`, `VISIT_CARD_FA_SELECT_OPTIONS`). O `keystatic.config.ts` usa `fields.select({ options: VISIT_CARD_FA_SELECT_OPTIONS })` no campo `fontawesomeIcon` (reader valida contra as opções). A **edição** do ícone é no `/admin/socials` (DS V2, com seu próprio picker `fa-icon-select`). Para adicionar um ícone novo: importe-o no map e adicione uma entrada nas select options. (O antigo campo custom `fontawesomeIconSelectField()` + a página `/keystatic/icon-preview` foram removidos no slice ⑤.)
```

- [ ] **Step 4: Adicionar o slice ⑤ na seção "Admin unificado"**

Após o bullet do **Slice ④**, adicione:

```markdown
- **Slice ⑤ (Votação na shell + delete do editor Keystatic):** o painel admin da votação migrou pro shell em **`/admin/sessoes`** (`app/(admin)/admin/sessoes/page.tsx`) reusando os componentes DS V2 existentes (`CreateSessionForm`/`SessionsManager`/`UsersTable`/`BackupsPanel`) — sem gate próprio (o `(admin)/layout.tsx` já barra não-admin). `/votacao/admin` virou **redirect** pra `/admin/sessoes`; a votação **pública** (`/votacao`, `/votacao/[id]`) e os controles de admin na detail (encerrar + roleta de desempate) ficam intocados. O **editor Keystatic foi removido** (`app/keystatic`, `app/api/keystatic`, `lib/keystatic-fa-icon-picker-input.tsx`, `lib/keystatic-fontawesome-icon-select-field.tsx`, deps `@keystatic/next` + `@keystar/ui`, e os 4 envs OAuth `KEYSTATIC_*`); o **reader permanece** (`@keystatic/core` + `lib/keystatic-reader.ts` + `lib/site-content.ts`) alimentando o site público, e o `keystatic.config.ts` foi simplificado (campo FA custom → `fields.select`). Spec/plano: `docs/superpowers/{specs,plans}/2026-06-04-admin-unificado-votacao-slice5*`.
```

- [ ] **Step 5: Atualizar a seção de Environment variables**

Na lista de "Key variables", remova/ajuste as 4 chaves OAuth do editor. Troque a linha:

```markdown
- `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, `KEYSTATIC_SECRET`, `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` — Keystatic GitHub OAuth
```

por:

```markdown
- (removidas no slice ⑤) `KEYSTATIC_GITHUB_CLIENT_ID/_SECRET`, `KEYSTATIC_SECRET`, `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` — eram do editor Keystatic, que saiu. **Remover também da Vercel.**
```

Mantenha `KEYSTATIC_GITHUB_REPO` (reader). Na seção do Vercel ("Env vars: copiar de..."), confirme que não lista mais as 4 chaves OAuth do editor.

- [ ] **Step 6: Atualizar a seção "Keystatic & Vercel deployment"**

Essa seção descreve o fluxo de publish do **editor** (cada Save commita). Como o editor saiu, substitua o corpo por:

```markdown
## Edição de conteúdo & deploy (Vercel)

A edição de conteúdo agora é no **`/admin` unificado** (slice ①–⑤): cada save commita direto na `main` via o token GitHub linkado, o que dispara um deploy de produção na Vercel (modelo de publish = redeploy). O **editor Keystatic foi removido**; o `@keystatic/core` permanece só como **reader** (lê o YAML de `content/` no build/ISR). Pra iterar sem publicar, use uma branch e o Preview da Vercel, depois PR pra `main`.
```

- [ ] **Step 7: Verificação completa (capturar output real)**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/web
pnpm prettier:check   # corrigir só os arquivos do slice se acusar
pnpm lint             # clean
pnpm exec tsc --noEmit
pnpm test             # Jest verde
pnpm test:e2e sessoes.e2e.ts votacao.e2e.ts
pnpm build:ci         # GATE: /admin/sessoes no route table; /keystatic e /api/keystatic SUMIRAM; site público (reader) builda
```

Expected: tudo verde; no route table do build não aparecem `/keystatic` nem `/api/keystatic`, aparece `/admin/sessoes`, e as rotas públicas (`/`, `/votacao`, `/posts/[slug]`, etc.) buildam (prova de que o reader segue lendo YAML).

- [ ] **Step 8: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev
git add CLAUDE.md
git commit -m "docs(admin): CLAUDE.md para slice ⑤ (votação na shell + editor keystatic removido)"
```

---

## Self-review (do plano contra a spec)

**Cobertura da spec:**

- §3.1 fold do painel → `/admin/sessoes` (Task 1), redirect + link (Task 2). ✅
- §3.2 delete editor: decoplar config (Task 4), apagar arquivos + deps (Task 5), envs + órfãos (Task 6). ✅
- §3.2 manter reader/core/site-content: nunca tocados; verificado no build (Task 7 Step 7). ✅
- §4 UI (`SectionHeader` por seção, 4 seções) → Task 1. ✅
- §5 testes: `sessoes.e2e.ts` + ajuste `votacao.e2e.ts` (Task 3); build como gate (Task 7). ✅
- §6 riscos: `fields.select` (refina o `fields.text` da spec — mesmo shape, mais seguro); `pnpm install` p/ lockfile (Task 5); action items do usuário (Vercel envs) documentados (Task 7). ✅
- §7 aceite 1–7 → cobertos por Tasks 1–7. ✅

**Placeholders:** nenhum TBD/TODO; todo passo de código mostra o código; comandos com expected output.

**Consistência de tipos/nomes:** `SessoesPage` default export; props de `UsersTable`/`BackupsPanel` idênticas às do uso atual; `fields.select` com `VISIT_CARD_FA_SELECT_OPTIONS` + `defaultValue: 'brands__github'` (já presente nas options) em ambos os campos; rota `/admin/sessoes` consistente entre Task 1/2/3/7 e sidebar/CRUMB já existentes.

**Refinamento sobre a spec:** a spec dizia `fields.text()` pro campo FA; o plano usa `fields.select(VISIT_CARD_FA_SELECT_OPTIONS)` — mesmo shape de leitura (string), porém preserva a validação contra opções que o reader já fazia. Intenção da spec ("mesmo shape, dropa @keystar/ui") mantida.
