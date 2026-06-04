# Admin Unificado — Slice ⑤ Votação na shell + delete do editor Keystatic

**Data:** 2026-06-04
**Status:** Aprovado (design) — aguardando revisão da spec
**Escopo:** Sub-projeto **⑤ (final)** do admin unificado: (A) mover o **painel admin** da votação pro shell `/admin` em `/admin/sessoes`, reusando os componentes DS V2 existentes; (B) **deletar o editor Keystatic** (UI + API routes + campos só-editor + deps `@keystatic/next`/`@keystar/ui`), mantendo o **reader** que alimenta o site público.
**Depende de:** slices ①–④ (admin shell, engine git, auth linkado, conteúdo, mídia). PRs #36/#37/#38 merged; #39 (slice ④) aberto — slice ⑤ ramifica de `main` e é mergeado **após** #39 (sem sobreposição de arquivos).
**Fonte de design:** mockup do admin (grupo "Votação" na sidebar); mapa de exploração do código (votação UI, admin shell, footprint keystatic).

---

## 1. Objetivo

Encerrar o roadmap do admin unificado, deixando **um único lugar de gestão** (`/admin`) para todo o conteúdo + a operação da votação, e **removendo a UI legada do Keystatic** (substituída pelos forms DS V2 dos slices ②–④). O site público de votação (`/votacao`, `/votacao/[id]`) e a leitura de conteúdo YAML (reader Keystatic) **permanecem intactos**.

### Não-objetivos

- **Não** remover `@keystatic/core` nem o reader (`lib/keystatic-reader.ts`/`lib/site-content.ts`) — o site público segue lendo YAML no build/ISR via `getKeystaticReader()`.
- **Não** mover a **votação pública** (`/votacao`, `/votacao/[id]`) pro shell — usuário comum (não-admin) não entra no `/admin` (gate `is_admin`). Eles continuam votando no site.
- **Não** tirar os **controles de admin** (encerrar sessão + roleta de desempate) da página de detalhe `/votacao/[id]` — ficam onde os filmes/resultados são exibidos.
- **Não** mexer na Go API (handlers, store, envelope), no fluxo OAuth Google da votação, nem nos endpoints `/votacao/*` / `/admin/backup`.
- **Não** migrar conteúdo nem schema de YAML — só simplifica os tipos de campo do `keystatic.config.ts` preservando o shape de leitura.

---

## 2. Decisões travadas (brainstorming)

| Decisão                         | Escolha                                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Escopo do fold                  | **Só o painel admin** (`/votacao/admin` → `/admin/sessoes`); votação pública e controles de admin na detail ficam.                                     |
| Boundary do delete keystatic    | **Só o editor** (routes + campos só-editor + `@keystatic/next`/`@keystar/ui`); **mantém** reader + `@keystatic/core`.                                  |
| Tamanho                         | **Slice ⑤ inteiro** num spec/plano/PR (as duas partes são independentes e pequenas).                                                                   |
| Componentes do `/admin/sessoes` | **Reuso** dos componentes DS V2 existentes (`CreateSessionForm`/`SessionsManager`/`UsersTable`/`BackupsPanel`).                                        |
| `/votacao/admin` antigo         | **Redirect** pra `/admin/sessoes` (bookmarks/links não dão 404).                                                                                       |
| Campo FA icon no config         | `fontawesomeIconSelectField()` → **`fields.select(VISIT_CARD_FA_SELECT_OPTIONS)`** (built-in; mesmo shape/validação de leitura; some o `@keystar/ui`). |

---

## 3. Arquitetura

### 3.1 Parte A — Fold do painel admin → `/admin/sessoes`

O painel hoje vive em `app/(site)/votacao/admin/page.tsx` (dentro do layout do site) e compõe quatro seções já em DS V2:

- `CreateSessionForm` (`components/votacao/create-session-form.tsx`)
- `SessionsManager` (`components/votacao/sessions-manager.tsx`) — lista, encerrar inline, expandir "ver votos" (lazy via `useAdminSessionVotes`)
- `UsersTable` (`components/votacao/admin/users-table.tsx`)
- `BackupsPanel` (`components/votacao/admin/backups-panel.tsx`)

…usando os hooks `hooks/votacao/*` (`useCurrentUser`, `useSessionList`, `useCreateSession`, …) e `use-admin-*` (`useAdminUsers`, `useAdminBackups`, `useCreateBackup`, `useAdminSessionVotes`).

**Nova página `app/(admin)/admin/sessoes/page.tsx`** (client) **reusa esses mesmos componentes e hooks** — só re-hospeda no shell. O shell `app/(admin)/admin/layout.tsx` **já** provê `ReactQueryProvider` + `ThemeProvider` dark + `Toaster` + o gate `is_admin` (redireciona não-admin pra "Acesso negado"). Logo a nova página **não** repete o gate/redirect próprio que o `/votacao/admin` tinha — fica mais enxuta. Cada seção é embrulhada com `SectionHeader` (label mono + régua) pra casar com o visual das outras telas do `/admin`.

Direção de dependência: a página em `app/(admin)/` importa de `components/votacao/*` e `hooks/votacao/*`. Esses componentes/hooks são agnósticos de layout (já usados pelo site), então o reuso é direto — sem mover arquivos de componente.

**`app/(site)/votacao/admin/page.tsx` vira um redirect** (`import { redirect } from 'next/navigation'` → `redirect('/admin/sessoes')`). Mantém a rota viva pra bookmarks/links externos, sem duplicar UI. (Server component mínimo.)

**Link admin repontado:** `app/(site)/votacao/page.tsx` linha 41 — `href="/votacao/admin"` → `href="/admin/sessoes"` (continua condicionado a `is_admin`).

**Sidebar/CRUMB/contagem já fiados (sem mudança):** `components/admin/admin-sidebar.tsx` já tem o grupo "Votação" → item "Sessões" → `/admin/sessoes`; `app/(admin)/admin/layout.tsx` já tem `CRUMB['/admin/sessoes'] = ['Votação', 'Sessões']`; o dashboard já mostra o card de contagem via `hooks/admin/use-sessions-count.ts`.

**Intocados:** `app/(site)/votacao/page.tsx` (fora o link), `app/(site)/votacao/[id]/page.tsx` (incl. encerrar + `TiebreakRoulette`), e todos os componentes/hooks de votação.

### 3.2 Parte B — Delete do editor Keystatic

**Reader vs editor (a fronteira de risco):** `lib/keystatic-reader.ts` importa `keystaticConfig` **e** `getGithubRepoSlash` de `keystatic.config.ts` e roda `createReader(process.cwd(), keystaticConfig)` (ou `createGitHubReader` em draft mode). O site público lê todo o conteúdo por aí (`lib/site-content.ts`). Então **o config sobrevive** (simplificado), só o **editor** sai.

**Deletar (editor-only):**

- `app/keystatic/**` — `[[...params]]/page.tsx` (entry `makePage`), `icon-preview/{layout,page}.tsx`, `layout.tsx`.
- `app/api/keystatic/**` — `[...params]/route.ts` (`makeRouteHandler`).
- `lib/keystatic-fa-icon-picker-input.tsx` — componente de UI do picker (usa `@keystar/ui`).
- `lib/keystatic-fontawesome-icon-select-field.tsx` — factory do campo custom (só usada pelo config).

**Simplificar `keystatic.config.ts`:**

- Remover `import { fontawesomeIconSelectField } from './lib/keystatic-fontawesome-icon-select-field'`.
- Trocar os 2 usos de `fontawesomeIconSelectField({ ... })` (linhas ~146 e ~191, campo `fontawesomeIcon`) por `fields.select({ label, description, defaultValue: 'brands__github', options: VISIT_CARD_FA_SELECT_OPTIONS })`. O reader devolve a **mesma string** (ex.: `brands__github`) e valida contra as opções, igual ao campo custom; `site-content` resolve via `VISIT_CARD_FA_ICON_MAP`. A edição do ícone agora é no `/admin/socials` (slice ②, com seu próprio `fa-icon-select`). _(Refina o `fields.text()` cogitado no design: `fields.select` built-in preserva a validação que o reader já fazia, sem puxar `@keystar/ui`.)_
- Limpar o comentário/description que aponta pra `/keystatic/icon-preview` (a página some).
- **Manter** `storage`, todas as collections/singletons e `getGithubRepoSlash`.

**Manter intactos:** `@keystatic/core`, `lib/keystatic-reader.ts`, `lib/site-content.ts`, `lib/visit-card-fontawesome.ts`, `lib/visit-card-cells.ts`, `lib/og-visit-card-image.tsx`.

**Deps removidas** (`apps/web/package.json`): `@keystatic/next`, `@keystar/ui`. **Mantida:** `@keystatic/core` (reader). → roda `pnpm install` (informado, não rodado pelo agente) pra atualizar o lockfile.

**Env vars removidas** (`.env.example` + `apps/web/.env.example` + CLAUDE.md): `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, `KEYSTATIC_SECRET`, `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`. **Mantida:** `KEYSTATIC_GITHUB_REPO` (reader + admin backend). → remover da Vercel é **action item do usuário**.

**`next.config.mjs`:** o comentário/externals sobre "Keystatic lê YAML em runtime" é **reader-related** — mantém. Confirmar que não há referência a `@keystatic/next` lá.

**Verificação de órfãos:** garantir que nada mais importa os arquivos deletados (sem middleware de keystatic; sem link do site público pro `/keystatic` além do back-link da própria `icon-preview`, que sai junto).

---

## 4. UI (DS V2)

`/admin/sessoes` segue o padrão das demais telas do shell: o `(admin)/layout.tsx` desenha sidebar + top bar + breadcrumb; a página renderiza `space-y` de seções, cada uma com `SectionHeader`:

1. **Nova sessão** — `CreateSessionForm`.
2. **Sessões** — `SessionsManager` (lista + encerrar inline + "ver votos"). Cada sessão linka pra `/votacao/[id]` (onde ficam os filmes/resultados + a roleta de desempate pro admin).
3. **Usuários** — `UsersTable`.
4. **Backups** — `BackupsPanel` (disparar manual + histórico).

Os componentes já são DS V2 (puros, recebem dados por prop, com stories); o wiring (hooks `use-admin-*`) fica na page/`SessionsManager`, como hoje. As queries admin são gated por `is_admin` (`enabled`) pra não dispararem em não-admin — comportamento preservado.

Nenhum componente novo de votação; a entrega de UI é a **página `/admin/sessoes`** que compõe os existentes + os ajustes de redirect/link da Parte A.

---

## 5. Testes

- **E2E `app/(admin)/admin/sessoes/sessoes.e2e.ts`** (mocks host-agnósticos, envelope, `page.route('**/...')`): admin enxerga as 4 seções (criar, sessões, usuários, backups); não-admin cai no "Acesso negado" do shell. Migrar o bloco `'/votacao/admin dashboard'` do `votacao.e2e.ts` pra cá (mesmos mocks de `**/votacao/sessions`, `**/votacao/admin/users`, `**/votacao/admin/backups`).
- **E2E `votacao.e2e.ts`:** remover o bloco `/votacao/admin` (movido); manter listagem/voto/detalhe/desempate; adicionar um assert leve de que `/votacao/admin` redireciona pra `/admin/sessoes`.
- **Build (`build:ci`) é o gate crítico:** confirma que (a) as rotas do editor (`/keystatic`, `/api/keystatic`) sumiram, (b) o reader segue compilando e lendo YAML (rotas públicas do site buildam), (c) `/admin/sessoes` entra no route table, (d) sem import órfão dos arquivos deletados.
- **Smoke do reader:** o build do site público (que renderiza socials/visit-card via reader) é a verificação de que `fields.text()` não quebrou a leitura. Se houver teste Jest existente de `site-content`/reader, mantê-lo verde.
- **Gates completos:** `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` (Jest), `pnpm build:ci`, E2E afetados.

---

## 6. Fora de escopo / riscos

- **Reader preservado:** o maior risco seria deletar o config e quebrar o reader — explicitamente evitado (config simplificado, não removido).
- **`fields.text()` é mais permissivo** que o select custom: aceitável porque o reader só precisa devolver a string e a edição validada migrou pro `/admin/socials`. Verificado no build.
- **Deps removidas exigem `pnpm install`** (lockfile) — informado, não rodado pelo agente (regra do projeto).
- **Action items do usuário:** remover os 4 env `KEYSTATIC_*` (OAuth) da Vercel; (herdados) instalar a GitHub App do Keystatic no `piluvitu-blog`, mudar o Build Command da Vercel pra `pnpm build`, considerar bump do Next ≥16.2.5.
- **Sem mudança na Go API** nem no fluxo OAuth Google da votação.

---

## 7. Critérios de aceite

1. `/admin/sessoes` mostra as 4 seções (nova sessão, sessões com encerrar+ver-votos, usuários, backups) reusando os componentes existentes; gate `is_admin` do shell barra não-admin.
2. `/votacao/admin` redireciona pra `/admin/sessoes`; o link admin no `/votacao` aponta pra `/admin/sessoes`.
3. Votação pública (`/votacao`, `/votacao/[id]`) e os controles de admin na detail (encerrar + roleta) seguem funcionando, intocados.
4. `/keystatic` e `/api/keystatic` deixam de existir (404/sem rota); `@keystatic/next` e `@keystar/ui` saem do `package.json`; os 4 env `KEYSTATIC_*` OAuth saem do `.env.example`/docs.
5. O **site público continua buildando e lendo** conteúdo YAML via reader (socials/visit-card icons inclusive) com o `keystatic.config.ts` simplificado.
6. `pnpm lint`, `pnpm exec tsc --noEmit`, Jest, E2E afetados passam; `pnpm build:ci` compila com `/admin/sessoes` no route table e sem as rotas do editor.
7. CLAUDE.md atualizado: seção "Admin unificado" com o slice ⑤; Tech Stack/Architecture refletindo que o **editor** Keystatic saiu (reader permanece).
