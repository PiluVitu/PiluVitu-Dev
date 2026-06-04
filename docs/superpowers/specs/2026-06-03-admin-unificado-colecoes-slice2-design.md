# Admin Unificado — Slice ② CRUD de coleções estruturadas

**Data:** 2026-06-03
**Status:** Aprovado (design) — aguardando revisão da spec
**Escopo:** Sub-projeto **② (CRUD de coleções)** do admin unificado: lista + criar/editar/apagar/reordenar de **Projetos**, **Carreira**, **Socials** e o singleton **Perfil & bio**, escrevendo YAML neste repo via a engine do slice ①.
**Depende de:** **slice ① (Fundação)** — `app/(admin)/admin/` shell + gate `is_admin` + "Conectar GitHub" + cookie `piluvitu_admin_gh` + `lib/admin/git-write.ts` `commitFile()`. (PR #36.)
**Fonte de design:** mockups do usuário (lista de Projetos em cards, Carreira em tabela, form de Perfil & bio); schemas em `apps/web/keystatic.config.ts`.

---

## 1. Objetivo

Substituir a UI do Keystatic para as 4 superfícies estruturadas por formulários DS V2 dentro do admin unificado, **reusando o git como fonte da verdade**. Cada salvar comita YAML direto na `main` (dispara deploy Vercel) usando o token GitHub linkado do slice ①.

O admin é **dono do seu próprio caminho de leitura+escrita+validação** (Zod + `yaml` + Octokit), **desacoplado do reader do Keystatic** — porque o Keystatic é apagado no slice ⑤ e o admin não pode depender dele. O **site público continua lendo via `getKeystaticReader()`** (bundle local em build), intocado.

### Não-objetivos

- **Upload** de imagem (campos de imagem ficam inputs de texto path/URL) → slice ④ (Mídia).
- Posts/editor MDX → slice ③. Dobrar a votação + apagar `/keystatic` → slice ⑤.
- Editar os singletons `visitCard` e a coleção `feeds` (fora do escopo deste slice; seguem no Keystatic por ora).
- Renomear slug de uma entrada existente (slug é **imutável após criar**; renomear = apagar + recriar, fora de escopo).
- Mudar de onde o **site público** lê (segue Keystatic/bundle local).

---

## 2. Decisões travadas (brainstorming)

| Decisão                   | Escolha                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Escopo                    | **Slice ② inteiro**: Perfil + Projetos + Carreira + Socials, CRUD completo                                                    |
| Leitura no admin          | **Live do GitHub** (main, via token linkado; repo é público) + **mutações otimistas**. Site público intocado                  |
| Acoplamento com Keystatic | **Desacoplado** — admin lê/valida via **Zod + `yaml` + Octokit**, não via reader do Keystatic                                 |
| Campos de imagem          | **Input de texto (path/URL)** agora; upload-to-git no slice ④                                                                 |
| Reordenação               | **Drag-and-drop** (`@dnd-kit`) + **commit atômico multi-arquivo** (`commitFiles`)                                             |
| Serialização YAML         | Adiciona dep **`yaml`** (puro JS); chaves na ordem on-disk + block scalars nos multiline; não byte-idêntico ao Keystatic (ok) |
| Apresentação              | Perfil = **página** (`/admin/perfil`); coleções = **lista + modal** (Dialog/Sheet) pra criar/editar                           |
| Slug ao criar             | Auto-gerado do nome (slugify) + editável; **imutável ao editar**                                                              |
| Apagar                    | **Dialog de confirmação** antes (comita remoção do arquivo na main)                                                           |

---

## 3. Arquitetura

### 3.1 Registry de coleções (`lib/admin/content-registry.ts`)

Fonte única que descreve cada coleção; handlers, serializer e reader são genéricos sobre ela.

```ts
type CollectionKey = 'projects' | 'carreiras' | 'socials'
interface CollectionDef<T> {
  key: CollectionKey
  dir: string // 'content/projects'
  slugField: string // 'projectSlug' | 'orgSlug' | 'key'
  schema: ZodType<T> // valida leitura + escrita + form
  keyOrder: (keyof T)[] // ordem das chaves no YAML (minimiza diff)
  multiline: (keyof T)[] // campos que viram block scalar (>-)
  label: string // 'Projetos'
}
export const COLLECTIONS: Record<CollectionKey, CollectionDef<any>>
```

`profile` (singleton) é tratado à parte (sem slug/lista): `lib/admin/profile-io.ts` com seu próprio Zod + path `content/site/profile/index.yaml`.

### 3.2 Caminho de escrita

form (client) → Zod validate → `serializeEntry(def, data)` (YAML) → engine (`commitFile`/`commitFiles`/`deleteFile`) com o token do cookie → commit na `main`.

### 3.3 Caminho de leitura (live, desacoplado)

`lib/admin/content-read.ts`:

- `listEntries(def, token)` — Octokit `repos.getContent` no `def.dir` (lista subdirs) → para cada, `getContent` do `index.yaml` (em paralelo) → `yaml.parse` → `def.schema.parse`. Devolve `{ slug, data }[]` ordenado por `order`.
- `getEntry(def, slug, token)` — lê um `index.yaml`.
- `readProfile(token)` — lê o singleton.

Usa o token linkado (evita rate-limit de 60/h; repo é público). Erros de parse/validação propagam como erro do endpoint (não silenciam).

---

## 4. Extensões da engine (`lib/admin/git-write.ts`)

Reusam o padrão de auth/refresh já existente (`AdminGithubToken`, retry em 401, devolve `refreshed`).

- **`deleteFile(auth, { repo, path, message, branch? }): Promise<CommitResult>`** — `getContent` p/ sha → `repos.deleteFile`. Remove a entrada (o dir vazio some do git).
- **`commitFiles(auth, { repo, files: {path, content}[], message, branch? }): Promise<CommitResult>`** — commit **atômico multi-arquivo** via Git Data API: `git.getRef` → `git.getCommit(base)` → `git.createTree({ base_tree, tree: files→blobs })` → `git.createCommit` → `git.updateRef`. Usado pelo drag-reorder (reescreve `order` de várias entradas num só commit/deploy).

Ambos com testes Jest usando `OctokitLike` estendido (mock), sem rede.

---

## 5. Zod schemas + serializer YAML

### 5.1 Schemas (`lib/admin/content-schemas.ts`)

Um Zod por superfície espelhando `keystatic.config.ts`. Fonte única pra read-validate, write-validate e validação de form.

- **project:** `projectSlug` (slug), `order` (int ≥0), `projectName` (1+), `subtitle` (default ''), `projectLogo`, `description` (multiline), `tags` (string[]), `deployLink` (''|url), `repoLink` (''|url), `image`, `altImage`.
- **carreira:** `orgSlug`, `order`, `orgName` (1+), `orgDescription` (multiline), `orgLink`, `image`, `altImage`, `title`, `location`, `date`, `atribuitions` (string[]), `current` (bool), `tags` (string[]).
- **social:** `key` (slug), `order`, `socialDescription`, `socialLink`, `iconMode` (`'fontawesome'|'image'`), `fontawesomeIcon` (enum das chaves de `VISIT_CARD_FA_SELECT_OPTIONS`), `image`, `altImage`.
- **profile:** `displayName`, `avatarSrc`, `avatarAlt`, `roleHighlight`, `companyName`, `companyLink`, `companyLinkColor` (enum dos hex do select), `bio` (multiline), `availabilityOpen` (bool), `availabilityLabel`, `location`, `disciplines` (string[]).

Slug: `^[a-z0-9]+(?:-[a-z0-9]+)*$`.

### 5.2 Serializer (`lib/admin/content-yaml.ts`)

- `serializeEntry(keyOrder, multiline, data): string` — monta um `yaml.Document` (pacote `yaml`), seta as chaves na ordem de `keyOrder`, marca `multiline` como block scalar (`>-`/`|`), e devolve a string. Best-effort match ao formato Keystatic; **YAML válido que os readers parseiam** — diffs não são byte-idênticos (aceito; Keystatic sai no ⑤).
- `parseEntry(def, raw): T` — `yaml.parse` + `def.schema.parse` (usado no read path).
- Teste de **round-trip**: `parse(serialize(x)) ≡ x` pros 4 schemas.

> **Dep nova:** `yaml` (eemeli) — puro JS, sem install scripts → não precisa de `allowBuilds`; `minimumReleaseAge` cobre. `pnpm --filter @piluvitu/web add yaml` (comando informado, **não rodar pelo agente**).

---

## 6. Rotas (handlers genéricos sobre o registry)

Todas exigem o cookie `piluvitu_admin_gh` válido (escrita pela engine; leitura usa o token). `[collection]` é validado contra `COLLECTIONS` (404 `unknown_collection` se inválido). Resposta JSON simples (rotas Next, não envelope Go). `export const dynamic = 'force-dynamic'`.

```
GET    /api/admin/content/[collection]            → { entries: {slug,data}[] }   (lista live)
POST   /api/admin/content/[collection]            → cria (body=data; slug do slugField; 409 se já existe)
PUT    /api/admin/content/[collection]/[slug]     → atualiza (slug imutável)
DELETE /api/admin/content/[collection]/[slug]     → apaga (deleteFile)
POST   /api/admin/content/[collection]/reorder    → body { slugs: string[] } → reescreve order via commitFiles
GET    /api/admin/content/profile                 → { data }
PUT    /api/admin/content/profile                 → atualiza o singleton
```

Erros: 401 `not_linked` (sem cookie), 400 `validation` (Zod falha, com campos), 409 `slug_exists`, 404 `not_found`/`unknown_collection`, 502 `github_error`. Sempre devolve mensagem pt-BR.

---

## 7. As 4 superfícies (DS V2)

Rotas sob `app/(admin)/admin/`. Dados via TanStack Query (hooks em `hooks/admin/content/`); mutações **otimistas** (`onMutate` atualiza o cache, `onError` reverte, `onSettled` invalida). Toda escrita usa `errorMessage()`/`toast`.

### 7.1 Perfil & bio — `/admin/perfil` (página, edit-only)

Form de página inteira (`components/admin/content/profile-form.tsx`): nome/cargo (roleHighlight)/empresa+link+cor (select de cor)/bio (textarea)/toggle disponibilidade+label/localização/disciplines (tag-input)/avatar (input de texto path). Botão "Salvar perfil". `GET/PUT /profile`.

### 7.2 Projetos — `/admin/projetos` (lista de cards + modal)

`project-list.tsx` (cards DS V2, drag-reorder) + "+ Novo projeto" → `project-form.tsx` num **Dialog**. Campos: nome/subtítulo/logo (path)/descrição (textarea)/tags (tag-input)/deployLink/repoLink/image (path)/altImage. Criar gera slug do nome (editável); editar trava o slug.

### 7.3 Carreira — `/admin/carreira` (tabela + modal)

`carreira-list.tsx` (tabela Empresa/Cargo/Período/Status com badge "Atual"/"Encerrado", drag-reorder) + "+ Nova experiência" → `carreira-form.tsx` num Dialog. Campos incl. `atribuitions` (lista multi-linha) + toggle `current` + tags.

### 7.4 Socials — `/admin/socials` (lista + modal)

`social-list.tsx` (drag-reorder) + modal `social-form.tsx` com o **picker de ícone Font Awesome** (reusa `VISIT_CARD_FA_SELECT_OPTIONS` + o mapa de ícones; mesmo conjunto do visit-card). Campos: descrição/link/iconMode (select)/fontawesomeIcon (picker)/image (path)/altImage.

### 7.5 Compartilhados (`components/admin/content/`)

- `tag-array-input.tsx` (chips add/remove), `fa-icon-select.tsx`, `delete-confirm-dialog.tsx`, `sortable-list.tsx` (wrapper `@dnd-kit` que emite a nova ordem de slugs → `reorder` mutation).
- Sidebar do shell (slice ①) já aponta pra `/admin/projetos`, `/admin/carreira`, `/admin/perfil`; adicionar `/admin/socials` ao registry de nav da sidebar.

---

## 8. Testes (diretivas de QA do projeto)

- **Jest:** serializer round-trip (4 schemas) + ordem de chaves + multiline; Zod aceita/rejeita (slug inválido, url, enum de cor/ícone); `slugify`; cálculo de reorder (slugs → order 0..n); engine `deleteFile` (sha + delete) e `commitFiles` (tree+commit+updateRef) com `OctokitLike` mockado; refresh em 401.
- **Storybook:** cada lista (cards/tabela/list) em estados vazio/povoado; cada form (criar/editar/inválido); `fa-icon-select`, `tag-array-input`, `delete-confirm-dialog`, `sortable-list`.
- **Playwright (`*.e2e.ts` colocados):** por superfície — lista renderiza (mock `**/api/admin/content/...`), criar (assert body), editar, apagar (confirma), reorder (assert `{slugs:[...]}` no POST), erro de validação. Mocks host-agnósticos; sem GitHub real.

---

## 9. Fora de escopo / riscos

- Upload de imagem (④), Posts/MDX (③), votação+Keystatic (⑤), `visitCard`/`feeds`.
- **Risco — diff YAML:** não byte-idêntico ao Keystatic (aceito).
- **Risco — edição concorrente:** editar a mesma entrada no admin novo e no Keystatic ainda-presente gera churn de formato; o usuário usa o admin novo (aceito até ⑤).
- **Risco — lag pós-write do GitHub Contents API:** mitigado por update otimista + refetch em background.
- **Risco — rename de slug:** não suportado (imutável); documentado.

---

## 10. Critérios de aceite

1. `/admin/perfil`, `/admin/projetos`, `/admin/carreira`, `/admin/socials` listam dados **live do GitHub** (token linkado) e exigem o cookie de link.
2. Criar/editar/apagar uma entrada de cada coleção comita o YAML correto em `content/<col>/<slug>/index.yaml` (validado uma vez manualmente; coberto por testes com Octokit mockado), com slug imutável ao editar e dialog de confirmação ao apagar.
3. Editar o Perfil comita `content/site/profile/index.yaml`.
4. Drag-reorder reescreve os `order` num **único commit** (`commitFiles`).
5. Mutações refletem na hora (otimista) e o reader live confirma após o refetch.
6. `pnpm lint`, `pnpm exec tsc --noEmit`, Jest, e os E2E novos passam; `pnpm --filter @piluvitu/web build` compila. `pnpm audit` sem novas vulnerabilidades por causa do `yaml`.
