# Admin Unificado — Fundação (slice ①)

**Data:** 2026-06-03
**Status:** Aprovado (design) — aguardando revisão da spec
**Escopo:** Sub-projeto **① Fundação** de um admin unificado DS V2 que centraliza posts, dados do site e votação numa única tela.
**Depende de:** fundação DS V2 (tokens/fontes em `globals.css`), `@octokit/rest` (já dep), GitHub App do Keystatic (já instalada neste repo), API Go de votação (auth Google + `is_admin`).
**Fonte de design:** mockups enviados pelo usuário (dashboard "Bem-vindo de volta", listas de Posts/Projetos/Carreira, form "Perfil & bio", biblioteca de Mídia).

---

## 1. Objetivo

Hoje a edição de conteúdo está fragmentada em **três sistemas com três UIs e três logins**:

| Área                                | CMS/Backend | Storage / Auth                             | Reader (reusável)        | UI hoje                         |
| ----------------------------------- | ----------- | ------------------------------------------ | ------------------------ | ------------------------------- |
| Perfil, Projetos, Carreira, Socials | Keystatic   | `content/*` YAML neste repo · GitHub OAuth | `lib/site-content.ts` ✅ | `/keystatic` (UI `@keystar`)    |
| Posts (blog)                        | TinaCMS     | MDX no repo privado `piluvitu-blog`        | `lib/blog-posts.ts` ✅   | `/admin` (UI estática Tina)     |
| Sessões de votação                  | API Go      | SQLite · Google OAuth + `ADMIN_EMAILS`     | hooks `votacao/*` ✅     | `/votacao/admin` (React custom) |

O objetivo final é **uma só tela de admin DS V2** (conforme mockups) que unifica tudo, **reaproveitando a camada de dados** (readers, git como fonte da verdade, API Go) e substituindo apenas as **UIs de edição** por formulários custom.

Por ser um projeto multi-subsistema, foi **fatiado em 5 sub-projetos** (seção 3). Esta spec detalha **só o slice ① (Fundação)** — o chassi compartilhado em que todos os outros se conectam.

### Não-objetivos (deste slice)

- Formulários de edição de conteúdo (Perfil/Projetos/Carreira/Socials) → slice ②.
- Lista/edição de posts e o editor de markdown/MDX → slice ③.
- Biblioteca de mídia com upload → slice ④.
- Embutir a votação no shell e **apagar** `/keystatic` + `/admin` (Tina) → slice ⑤.
- Qualquer mudança na **API Go** (ela permanece intocada).

---

## 2. Decisões travadas (brainstorming)

| Decisão                       | Escolha                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Quanto da UI atual substituir | **Full custom** — formulários DS V2 pra tudo (inclui editor MDX próprio); aposenta UIs do Keystatic e Tina   |
| Login no admin                | **Google** (reusa a sessão da votação; gate por `is_admin`)                                                  |
| Identidade dos commits        | **GitHub linkado do usuário** — commits atribuídos a você, não a um bot                                      |
| Reuso pro OAuth do GitHub     | **GitHub App do Keystatic** (client id/secret + slug já existentes; app já instalada neste repo)             |
| Modelo de publicação          | **Commit direto na `main`** → dispara deploy Vercel; visibilidade via flag `draft` no frontmatter            |
| Onde guardar o token GitHub   | **Cookie httpOnly criptografado** (AES-256-GCM via `crypto` nativo do Node) — engine de escrita 100% no Next |
| Fatiamento                    | 5 sub-projetos, **Fundação primeiro** (①→②→③→④→⑤)                                                            |

---

## 3. Decomposição em sub-projetos (visão geral)

Cada slice tem seu próprio ciclo spec → plano → build.

- **① Fundação (esta spec):** gate de sessão Google em `/admin`, fluxo "Conectar GitHub" (reusa a App do Keystatic), token selado em cookie, engine genérica `commitFile()` (Octokit, qualquer dos dois repos), e o **shell DS V2** (sidebar + top bar + layout + dashboard "Bem-vindo de volta" com os 4 stat cards). Sem formulários de conteúdo ainda — é o chassi.
- **② CRUD de coleções estruturadas:** lista + form de **Projetos**, **Carreira**, **Socials** e o singleton **Perfil & bio**. YAML neste repo. Leitura reusa `lib/site-content.ts`; escrita usa a engine de ①. Schemas espelham `keystatic.config.ts`.
- **③ Posts + editor MDX:** lista de posts + form de frontmatter + editor de corpo MDX com **preview ao vivo** usando o pipeline existente (`next-mdx-remote/rsc` + rehype-pretty-code + mermaid). Escreve MDX em `piluvitu-blog`. Aposenta o Tina.
- **④ Mídia:** grid de biblioteca + upload commitado no git.
- **⑤ Votação + limpeza:** dobra o `/votacao/admin` (já React custom) no shell unificado como "Sessões"; apaga as rotas `/keystatic` e `/admin` (Tina) ao atingir paridade.

---

## 4. Escopo do slice ① — Fundação

### 4.1 Mapa de rotas e arquivos (novos)

```
app/(admin)/layout.tsx                  → providers (ThemeProvider dark + ReactQueryProvider + Toaster), sem nav do site
app/(admin)/admin/layout.tsx            → shell: <AdminSidebar/> + <AdminTopBar/> + gate client is_admin
app/(admin)/admin/page.tsx              → dashboard ("Bem-vindo de volta" + 4 stat cards + posts recentes read-only)

components/admin/admin-sidebar.tsx        (+ .stories)  → grupos Coleções / Site / Votação + footer (Design System · Ver site · Sair)
components/admin/admin-top-bar.tsx        (+ .stories)  → breadcrumb + busca (placeholder) + Tema + avatar/nome
components/admin/stat-card.tsx            (+ .stories)  → número grande + sublinha (ex.: "5 publicados · 1 rascunho")
components/admin/github-link-banner.tsx   (+ .stories)  → "Conectar GitHub" / "Conectado como @login" + desconectar

lib/admin/token-cookie.ts   (+ .test.ts)  → sealToken/openToken (AES-256-GCM, crypto nativo)
lib/admin/git-write.ts      (+ .test.ts)  → commitFile() — engine de escrita (Octokit)
lib/admin/github-oauth.ts                 → authorizeUrl() + exchangeCode() (GitHub App user-to-server)

app/api/admin/github/login/route.ts       → redirect pro authorize do GitHub App (seta cookie de state CSRF)
app/api/admin/github/callback/route.ts     → troca code → sela token → seta cookie httpOnly
app/api/admin/github/status/route.ts        → { linked: bool, login?: string }
app/api/admin/github/unlink/route.ts        → limpa o cookie
app/api/admin/stats/route.ts                 → { posts, drafts, projects, careers } via readers existentes

app/(admin)/admin/admin.e2e.ts             → Playwright (gate + estados linked/unlinked), mocks host-agnósticos
```

> **Por que um route group `(admin)` separado de `(site)`:** o admin não usa o layout do site (sem footer/nav/visit-card), mas precisa de `ThemeProvider` (dark-first), `ReactQueryProvider` (hooks `votacao/*`) e `Toaster`. O `(admin)/layout.tsx` provê só isso.

### 4.2 Modelo de auth e segurança (duas camadas)

A sessão `piluvitu_session` é setada pela API Go em `promeia.piluvitu.com.br` e **não chega ao servidor Next** (`piluvitu.com.br`) — o browser a manda direto pro host da API. Por isso o gate é **client-side** (igual `/votacao/admin` faz hoje), e a segurança real fica na escrita.

- **Camada 1 — gate de UI (client, cosmético):** `/admin/*` usa `useCurrentUser()` (hook já existente). Se `!data?.is_admin`, renderiza "Acesso negado". Sem tocar na API Go.
- **Camada 2 — autorização de escrita (a fronteira real):** toda escrita usa o **token GitHub linkado** (do cookie selado). **O próprio GitHub** garante que o token só consegue commitar se você for colaborador do repo. Logo, mesmo uma sessão de UI forjada **não escreve** — a garantia vem das permissões do GitHub, não da nossa lógica de sessão. É isso que permite a **API Go ficar 100% intocada**.

### 4.3 Fluxo "Conectar GitHub" + token em cookie

Reusa a **GitHub App do Keystatic** (`KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`) — já instalada neste repo com permissão **Contents: read/write**, então tokens emitidos por ela já podem escrever em `content/*`.

1. **Setup one-time:** adicionar **um novo Callback URL** na App: `/api/admin/github/callback` (GitHub Apps aceitam múltiplos callbacks; não quebra o do Keystatic).
2. **`/login`:** gera `state` (CSRF) em cookie httpOnly curto e redireciona pra `https://github.com/login/oauth/authorize?client_id=…&state=…&redirect_uri=…/api/admin/github/callback`.
3. **`/callback`:** valida `state` → troca `code` em `https://github.com/login/oauth/access_token` → recebe `{ access_token, refresh_token?, expires_in? }`.
4. **Selagem:** `sealToken()` serializa `{ token, refreshToken?, expiresAt?, login }` e cifra com **AES-256-GCM** (chave derivada de `ADMIN_TOKEN_SECRET` via SHA-256). Formato do cookie: `base64url(iv ‖ authTag ‖ ciphertext)`. Cookie `piluvitu_admin_gh`, **httpOnly + Secure + SameSite=Lax**, path `/`.
5. **`/status`:** abre o cookie e devolve `{ linked, login }` (nunca devolve o token).
6. **`/unlink`:** expira o cookie.

**Expiração/refresh:** se a App tiver "Expire user authorization tokens" ligado, o token dura ~8 h e vem `refresh_token` (~6 meses). `git-write.ts` detecta `401` (ou `expiresAt` vencido), faz refresh em `…/access_token` com `grant_type=refresh_token`, re-sela o cookie e repete o commit **uma vez**. Se a App não expira tokens, `refreshToken`/`expiresAt` ficam ausentes e nunca se faz refresh.

### 4.4 Engine de escrita — `lib/admin/git-write.ts`

Primitiva única em que os slices ②/③/④ montam os formulários:

```ts
type Repo = 'site' | 'blog' // 'site' = PiluVitu-Dev ; 'blog' = piluvitu-blog
commitFile(opts: {
  repo: Repo
  path: string         // ex.: 'content/projects/live-prs/index.yaml'
  content: string      // texto já serializado (YAML/MDX)
  message: string      // mensagem de commit
  branch?: string      // default 'main'
}): Promise<{ commitSha: string }>
```

- Constrói um Octokit com o token do cookie (server-side; lança `AdminAuthError` se não linkado).
- `repos.getContent` pra obter o `sha` atual (se o arquivo existir) → `repos.createOrUpdateFileContents` (cria ou atualiza). Commit atribuído ao usuário linkado.
- `repo` resolve owner/name: `site` via `getGithubRepoSlash()` (já existe em `keystatic.config.ts`); `blog` via `BLOG_REPO_OWNER`/`BLOG_REPO_NAME`.
- **Slice ① entrega a engine + testes, mas não a usa em formulários ainda** (nenhuma escrita de conteúdo é exposta nesta fatia).

> **Nota repo blog (slice ③):** pra commits no `piluvitu-blog` saírem **como você**, a mesma GitHub App precisa estar instalada lá também (config one-time no GitHub). Enquanto não estiver, escrita no blog cai no bot `BLOG_REPO_TOKEN` (atribuição de bot). Tratado no slice ③.

### 4.5 Dashboard + shell (DS V2, dark-first)

- Reusa tokens do DS V2 (`--primary` ciano, `bg-accent-soft`, `rounded-pill`, `shadow-ds`) e a **fonte mono** pros labels/datas — mesma linguagem de `SectionHeader`/`PageTopBar` já no repo.
- **Sidebar** (`AdminSidebar`): grupos **Coleções** (Posts/Projetos/Carreira), **Site** (Perfil & bio/Mídia), **Votação** (Sessões), com contadores; footer com **Design System · Ver site · Sair**. Itens de slices futuros aparecem mas podem levar a páginas "em construção" até o slice respectivo.
- **Top bar** (`AdminTopBar`): breadcrumb ("Coleções / Posts"), campo de busca (placeholder, sem lógica nesta fatia), toggle **Tema** (`ModeToggle`) e avatar/nome (do `useCurrentUser`).
- **Dashboard** (`/admin`): header "Bem-vindo de volta, {nome}" + **4 stat cards** (Posts · Projetos · Experiências · Sessões de votação) + tabela **Posts recentes read-only** (prova o caminho de leitura; criar/editar é slice ③).
  - Contagens de site (posts/drafts/projects/careers) vêm de `/api/admin/stats` (server, via readers existentes).
  - Contagem de **Sessões** é uma ilha client que chama `votacaoApi.listSessions()` (browser → host da API, onde o cookie vive).
- **Banner de link** (`GithubLinkBanner`): se `/status` diz não-linkado, mostra "Conectar GitHub"; se linkado, "Conectado como @login" + desconectar. Visível no topo do dashboard.

### 4.6 Testes (diretivas de QA do projeto)

- **Jest (unit):**
  - `token-cookie.test.ts` — round-trip `seal→open`; rejeita cookie adulterado (authTag inválido); rejeita chave errada.
  - `git-write.test.ts` — monta path/owner certo por `repo`; passa `sha` no update e omite no create; refaz commit uma vez após `401` (Octokit mockado).
- **Storybook:** `StatCard`, `AdminSidebar`, `AdminTopBar`, `GithubLinkBanner` (estados linked/unlinked).
- **Playwright (`admin.e2e.ts`)** — mocks host-agnósticos (`**/auth/me`, `**/votacao/sessions`, `**/api/admin/github/status`, `**/api/admin/stats`) no padrão da votação:
  - não-admin (`/auth/me` → `is_admin:false`) → "Acesso negado".
  - admin → shell + dashboard renderizam; stat cards com os números mockados.
  - status não-linkado → banner "Conectar GitHub"; linkado → "Conectado como @x".

### 4.7 Setup one-time e variáveis de ambiente

- **GitHub App (Keystatic):** adicionar `…/api/admin/github/callback` (dev e prod) à lista de Callback URLs da App.
- **Nova env `ADMIN_TOKEN_SECRET`** (≥ 32 bytes aleatórios) em `apps/web/.env.local` e na Vercel — chave de cifragem do cookie de token.
- **Reusa** `KEYSTATIC_GITHUB_CLIENT_ID/SECRET`, `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`, `BLOG_REPO_OWNER/NAME`, `NEXT_PUBLIC_API_URL` (já existentes).
- Atualizar `apps/web/.env.example` + a seção "Environment variables" do `CLAUDE.md` (diretiva do projeto: tecnologia/fluxo novo ⇒ atualizar CLAUDE.md).

---

## 5. Riscos / pontos de atenção

- **Domínio do cookie da sessão Go (alternativa não escolhida):** poderíamos setar `piluvitu_session` em `.piluvitu.com.br` pra habilitar gate **server-side** no Next, mas isso mexe na API Go e foi descartado — a fronteira real de segurança já é a permissão do token GitHub na escrita (4.2). Mantido client-side.
- **Expiração de token da GitHub App:** mitigado pelo refresh em 4.3; se a App não expira tokens, é não-issue.
- **Atribuição de commits no blog:** depende de instalar a App no `piluvitu-blog` (slice ③); até lá, blog usa bot.
- **Gate client-side ≠ segredo:** o HTML do shell carrega antes do check `is_admin`. Aceitável — não há dados sensíveis no shell, e nenhuma escrita acontece sem o token GitHub. Conteúdo do site já é público.
- **`ADMIN_TOKEN_SECRET` ausente:** as rotas `/api/admin/github/*` devem falhar fechado (500 controlado), nunca emitir cookie sem cifra.

---

## 6. Critérios de aceite do slice ①

1. `/admin` mostra "Acesso negado" pra não-admin e o shell DS V2 pra admin.
2. "Conectar GitHub" completa o OAuth (App do Keystatic) e passa a exibir "Conectado como @login"; "Desconectar" limpa o estado.
3. `commitFile()` cria e atualiza um arquivo no repo `site` com commit atribuído ao usuário linkado (validado manualmente uma vez; coberto por teste com Octokit mockado).
4. Dashboard exibe os 4 stat cards com números reais (3 via `/api/admin/stats`, sessões via API Go) e a tabela de posts recentes read-only.
5. `pnpm lint`, `pnpm exec tsc --noEmit`, Jest e o E2E novo passam; `pnpm --filter @piluvitu/web build` compila.
