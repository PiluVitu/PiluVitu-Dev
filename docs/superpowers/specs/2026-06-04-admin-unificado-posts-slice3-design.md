# Admin Unificado — Slice ③ Posts + editor MDX

**Data:** 2026-06-04
**Status:** Aprovado (design) — aguardando revisão da spec
**Escopo:** Sub-projeto **③ (Posts)** do admin unificado: lista + criar/editar/apagar de posts do blog, com **editor MDX de fonte + preview ao vivo fiel**, escrevendo single-file MDX no repo `piluvitu-blog` via a engine do slice ①. **Aposenta o TinaCMS.**
**Depende de:** **slice ①** (shell `/admin`, gate `is_admin`, "Conectar GitHub", `lib/admin/git-write.ts` `commitFile`/`deleteFile`, cookie linkado) + **slice ②** (field primitives `components/admin/content/*`, padrão de rotas/hooks/modal, dep `yaml`). PRs #36 (merged) e #37.
**Fonte de design:** mockup do dashboard (tabela de Posts: Título/Status/Leitura/Atualizado + "Novo post"); `tina/config.tsx` (campos de frontmatter); `lib/blog-posts.ts` (formato on-disk); `app/(site)/posts/[slug]/page.tsx` (pipeline de render).

---

## 1. Objetivo

Substituir o editor TinaCMS por um editor de posts DS V2 dentro do admin unificado. Posts são **arquivos `.mdx` únicos** (`content/posts/<file>.mdx`) no **repo separado `piluvitu-blog`** — frontmatter YAML (`gray-matter`) + corpo MDX. O admin lê **live** e escreve via a engine (`commitFile(repo:'blog')`) com o **token GitHub linkado** (commits atribuídos a você, consistente com slices ①/②). O editor de corpo é **fonte MDX (CodeMirror) + preview ao vivo fiel** que reusa o pipeline de render real (remark/rehype/shiki + mermaid). Ao final, o **Tina é aposentado de vez**.

### Não-objetivos

- **Upload** de imagem (`coverImage` e imagens inline ficam input de texto path/URL) → slice ④ (Mídia).
- Dobrar a votação + apagar `/keystatic` → slice ⑤.
- Editor WYSIWYG (descartado — briga com MDX/código/mermaid).
- Mudar o **render público** dos posts (`app/(site)/posts/[slug]/page.tsx`) além de extrair o pipeline pra um módulo compartilhado.

---

## 2. Decisões travadas (brainstorming)

| Decisão                  | Escolha                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Escopo                   | **Slice ③ inteiro**: lista + frontmatter + editor MDX + preview + aposentar Tina                                                    |
| Editor + preview         | **Fonte (CodeMirror) + preview fiel** via endpoint `serialize` reusando o pipeline real (shiki + mermaid)                           |
| Repo/auth dos posts      | **Token linkado** (instalar a GitHub App do Keystatic no `piluvitu-blog`) → engine `commitFile(repo:'blog')`                        |
| Aposentar Tina           | **Sim, em ③** (última etapa, após o editor verificado): apaga `tina/`, `public/cms/`, devDeps, scripts; build Vercel → `next build` |
| Imagens                  | **Input de texto (path/URL)** agora; upload no ④                                                                                    |
| Apresentação do editor   | **Rota full-page** (`/admin/posts/[slug]`, `/admin/posts/novo`) — split-pane precisa de espaço                                      |
| Frontmatter desconhecido | **Preservado** no round-trip (não dropar keys extras)                                                                               |
| ISR pós-write            | `revalidateTag('blog-posts')` após write/delete (site público atualiza na hora)                                                     |

---

## 3. Arquitetura

### 3.1 IO de posts (`lib/admin/post-io.ts`, server-only)

Single-file MDX, repo `piluvitu-blog`, via o token linkado (Octokit) + `gray-matter` (parse) e `yaml` (serialize do frontmatter).

```ts
interface AdminPost {
  filename: string        // ex.: 'como-usar-husky.mdx' (rastreado p/ não orfanar no edit)
  slug: string            // fm.slug ?? filename sem ext
  frontmatter: PostFrontmatter
  body: string            // MDX
  readingTimeMinutes: number // computado (não autorado)
}
listPosts(token): Promise<AdminPost[]>         // lista content/posts/*.{md,mdx}, ordena por publishedAt desc
getPost(token, slug): Promise<AdminPost | null>
serializePost(fm, body, rawFrontmatter): string // frontmatter (known + preserved unknown) + '---\n' + body
```

- **Preserva keys desconhecidas:** lê todo o frontmatter; ao gravar, mescla os campos conhecidos editados com as keys extras originais (ex.: `readingTimeMinutes` legado, futuras). Nada é silenciosamente perdido.
- **Filename tracking:** `getPost`/`listPosts` devolvem `filename`; o **edit** grava de volta nesse `filename` (mesmo que ≠ slug); o **create** grava `content/posts/<slug>.mdx`.

### 3.2 Schema (`lib/admin/post-schema.ts`)

Zod do frontmatter conhecido: `title` (1+), `slug` (regex slug), `excerpt` (str), `coverImage` (str), `tags` (string[]), `publishedAt` (string ISO), `draft` (bool). `readingTimeMinutes` **não** é autorado (o reader computa via `estimateReadingTime`). Reusa o `SLUG_RE` do slice ② (`lib/admin/content-schemas.ts`).

### 3.3 Pipeline MDX compartilhado (`lib/mdx/render.tsx` — extração)

Hoje `app/(site)/posts/[slug]/page.tsx` define inline os plugins (`remark-gfm`, `rehype-slug`, `rehype-autolink-headings`, `rehype-pretty-code`) e o `mdxComponents` (intercepta `mermaid` → `MermaidBlock`). **Extrair** pra um módulo compartilhado:

- `MDX_REMARK_PLUGINS`, `MDX_REHYPE_PLUGINS` (config única)
- `mdxComponents` (mapa de componentes, inclui MermaidBlock)
- A página pública passa a importar daí (sem mudança de comportamento). O admin (preview) usa os mesmos.

### 3.4 Preview fiel

`POST /api/admin/posts/preview` recebe `{ mdx }`, roda `serialize(mdx, { mdxOptions: { remarkPlugins, rehypePlugins } })` (de `next-mdx-remote/serialize`) — o **shiki** é aplicado no serialize. Devolve a fonte serializada. O painel de preview é um client component que renderiza `<MDXRemote {...serialized} components={mdxComponents} />` (de `next-mdx-remote`), então **mermaid hidrata no client e o shiki vem do serialize — idêntico ao post real**. Debounce ~500 ms a partir da edição.

> A página pública continua usando `next-mdx-remote/rsc` (RSC) com os MESMOS plugins/components extraídos; o preview usa o caminho `serialize` + client `MDXRemote`. Mesmo pipeline, dois pontos de entrada.

---

## 4. Rotas (cookie linkado obrigatório; escrita via engine `repo:'blog'`)

Reusa os helpers do slice ② (`getLinkedToken`, `jsonError`, `resealIfRefreshed`). JSON simples. `export const dynamic = 'force-dynamic'`.

```
GET    /api/admin/posts            → { posts: AdminPost[] }   (live, linked token)
POST   /api/admin/posts            → cria content/posts/<slug>.mdx (409 se já existe)
GET    /api/admin/posts/[slug]     → { post: AdminPost }  (404 se não existe)
PUT    /api/admin/posts/[slug]     → grava no filename existente (slug imutável); revalidateTag('blog-posts')
DELETE /api/admin/posts/[slug]     → deleteFile(repo:'blog', filename); revalidateTag('blog-posts')
POST   /api/admin/posts/preview    → { mdx } → { serialized }  (serialize p/ o painel)
```

Erros: 401 `not_linked`, 400 `validation`, 409 `slug_exists`, 404 `not_found`, 502 `github_error` / `preview_error`. PUT/DELETE resolvem o `filename` via `getPost` antes de gravar (pra escrever no arquivo certo).

---

## 5. UI (DS V2)

- **`/admin/posts`** (`app/(admin)/admin/posts/page.tsx`) — **tabela** Título / Status (`● Publicado` ciano / `Rascunho` outline) / Leitura (`N min`) / Atualizado (`publishedAt`), com ações Editar/Apagar (confirm via `DeleteConfirmDialog` do slice ②) + **"+ Novo post"**. Sem drag-reorder (ordem = `publishedAt` desc). Substitui a tabela read-only do dashboard como destino do "Novo post".
- **`/admin/posts/novo`** + **`/admin/posts/[slug]`** (`.../novo/page.tsx`, `.../[slug]/page.tsx`) — **editor full-page**:
  - **Sidebar de frontmatter** (reusa `TextField`/`TextareaField`/`TagArrayInput`/`ToggleField` do slice ②): título, slug (derivado do título no create, imutável no edit), excerpt, coverImage (path), tags, publishedAt (input date), draft (toggle).
  - **Split-pane**: `components/admin/posts/mdx-editor.tsx` (CodeMirror, `@codemirror/lang-markdown`) à esquerda; `components/admin/posts/mdx-preview.tsx` (debounced → `/preview` → `MDXRemote` client) à direita.
  - Botão **Salvar** (cria/atualiza via hook). `PageTopBar` "← Posts".
- **Hooks** (`hooks/admin/posts/`): `use-posts-list`, `use-post`, `use-post-mutations` (create/update/delete), `use-mdx-preview` (debounced serialize). Mesmo padrão otimista do slice ②.
- **Sidebar do shell**: o item "Posts" já existe (slice ①, aponta `/admin`); muda pra `/admin/posts`. O dashboard (`/admin`) mantém o resumo; o "Novo post" e a edição vivem em `/admin/posts`.

### 5.1 Deps novas

`@uiw/react-codemirror`, `@codemirror/lang-markdown` (+ tema, ex. `@codemirror/theme-one-dark` ou estilo via CSS). Puro JS, sem install scripts. `pnpm --filter @piluvitu/web add @uiw/react-codemirror @codemirror/lang-markdown` (comando informado, **não rodar pelo agente**).

---

## 6. Aposentar o Tina (últimas tarefas, após o editor verificado)

- Apagar `apps/web/tina/` (config + `__generated__`), `apps/web/public/cms/`, e o `SlugFieldWithPreview` se não usado em outro lugar.
- Remover devDeps `tinacms` + `@tinacms/*` do `apps/web/package.json`; remover os scripts `tina:build`/`tina:dev`; trocar `"build": "tinacms build … && next build"` por `"build": "next build"`.
- **Vercel:** mudar o Build Command de `pnpm tina:build` pra `pnpm build` (= `next build`). Documentar.
- `CLAUDE.md` + `.env.example`: remover a seção Blog (TinaCMS) / `NEXT_PUBLIC_TINA_CLIENT_ID` / `TINA_TOKEN` (a leitura/render dos posts via `lib/blog-posts.ts` é **independente** do Tina e segue intacta).

> O render e a leitura públicos dos posts NÃO dependem do Tina (Tina era só a UI de edição). Apagá-lo não afeta o site no ar.

---

## 7. Testes

- **Jest:** round-trip `serializePost` → `gray-matter` parse (frontmatter conhecido + **preservação de keys desconhecidas** + body intacto); filename tracking; Zod do frontmatter; `listPosts`/`getPost` com Octokit mockado (base64 decode + gray-matter).
- **Storybook:** tabela de posts (vazio/povoado/draft), sidebar de frontmatter, `mdx-editor` (CodeMirror), `mdx-preview` (com serialize mockado).
- **Playwright:** `/admin/posts` lista; abrir editor; editar body + frontmatter → assert no PUT body; toggle draft; apagar (confirm); o `/preview` é mockado (sem shiki real no CI). Mocks host-agnósticos.

---

## 8. Fora de escopo / riscos

- Upload de imagem (④); votação+Keystatic (⑤).
- **Pré-requisito:** a GitHub App do Keystatic precisa estar instalada no `piluvitu-blog` (one-time, você) pro read/write com token linkado. Sem isso, as rotas de posts dão 502 ao gravar (token sem acesso).
- **Risco — latência do preview (shiki por keystroke):** mitigado por debounce ~500 ms; o serialize reusa os plugins exatos → preview = produção.
- **Risco — `next-mdx-remote` RSC vs serialize:** dois pontos de entrada do mesmo pacote; os plugins/components extraídos são compartilhados, mas o RSC (página) e o serialize (preview) têm assinaturas distintas. A extração mantém comportamento da página pública.
- **Risco — filename ≠ slug em posts legados:** tratado pelo filename tracking (edit grava no arquivo original).

---

## 9. Critérios de aceite

1. `/admin/posts` lista os posts do `piluvitu-blog` (live, token linkado), com status/leitura/data; "Novo post" abre o editor full-page.
2. Criar um post grava `content/posts/<slug>.mdx` (frontmatter + body) no `piluvitu-blog`; editar grava de volta no filename original (slug imutável); apagar remove o arquivo. Todos disparam `revalidateTag('blog-posts')`. (Validado uma vez manualmente; coberto por testes com Octokit mockado.)
3. Keys de frontmatter desconhecidas sobrevivem a um ciclo editar→salvar.
4. O editor mostra preview fiel: um bloco ` ```mermaid ` vira diagrama e um bloco de código vem com shiki, idêntico ao post público.
5. Tina removido: `tina/`, `public/cms/`, devDeps e scripts apagados; `build` = `next build`; o site público segue renderizando posts.
6. `pnpm lint`, `pnpm exec tsc --noEmit`, Jest, E2E passam; `pnpm --filter @piluvitu/web build` compila; `pnpm audit` sem novas vulns pelas deps do CodeMirror.
