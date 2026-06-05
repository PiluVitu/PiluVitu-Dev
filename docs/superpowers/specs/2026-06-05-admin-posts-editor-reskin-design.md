# Admin — Reskin do editor de posts (DS V2)

**Data:** 2026-06-05
**Status:** Aprovado (design) — aguardando revisão da spec
**Escopo:** Re-desenhar o editor de posts (`/admin/posts/{novo,[slug]}`) para o visual DS V2 dos mockups: título grande no topo, área de conteúdo com abas **Editar / Dividir / Pré-visualizar** + toolbar de formatação, e sidebar quebrada em cards (**Publicação / Metadados / Tags / Imagem de capa**). Mantém o IO de posts (slice ③) e o pipeline MDX compartilhado intactos.
**Depende de:** slice ③ (editor MDX: `post-editor`, `mdx-editor` CodeMirror, `mdx-preview`, `post-frontmatter-form`, `post-io`, `post-schema`, hook `use-mdx-preview`) e slice ④ (mídia: `useMediaMutations`/`fileToUpload`, `MediaPickerDialog`, `mediaRawUrl`).
**Fonte de design:** 3 mockups fornecidos pelo usuário (abas Editar/Dividir/Pré-visualizar; sidebar com 4 cards; dropzone de capa).

---

## 1. Objetivo

Substituir o layout atual do editor (3 colunas fixas lado a lado: `[form 300px | CodeMirror c/ nº de linha | preview]`, título dentro do form) pelo design dos mockups, sem mudar o que é gravado no `piluvitu-blog` nem o pipeline de render. É um **reskin + reorganização de UI** sobre a engine de posts existente, com uma adição de campo (`readingTimeMinutes`).

### Não-objetivos

- **Não** mexer no IO de posts (`lib/admin/post-io.ts`), nas rotas (`app/api/admin/posts/*`), no pipeline MDX (`lib/mdx/*`) nem no render público dos posts.
- **Não** trocar o CodeMirror por outro editor — só escondê-lo (sem nº de linha) e plugá-lo numa toolbar.
- **Não** adicionar features de editor além da toolbar de markdown (sem tabelas/imagens inline/etc. — YAGNI).
- **Não** mexer na votação, conteúdo (projetos/carreira/socials/perfil) nem na home.

---

## 2. Decisões travadas (brainstorming)

| Decisão          | Escolha                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| Editor de fonte  | **CodeMirror sem nº de linha + toolbar** (mantém o do slice ③, esconde `lineNumbers`, adiciona toolbar).       |
| Imagem de capa   | **Dropzone com upload** (rota de mídia, slice ④) **+ Biblioteca** (`MediaPickerDialog`) + path/URL manual.     |
| Tempo de leitura | **Campo `readingTimeMinutes` editável + auto-sugestão** (`≈ palavras/200` quando vazio; preserva o existente). |
| Stories          | **Todo componente novo tem `.stories.tsx` colocado** (lei de colocation + QA). Critério de aceite.             |
| Escopo           | Reskin inteiro num spec/plano/PR.                                                                              |

---

## 3. Arquitetura

### 3.1 Layout (`components/admin/posts/post-editor.tsx` — reescrito)

Página full-width dentro do shell `(admin)`. Estrutura:

- **Topo:** `PageTopBar` ("← Posts") (já existe).
- **Título:** `<input>` grande/bold full-width (`text-3xl font-bold`, fundo `bg-card`, borda suave), fora da sidebar. Edita `frontmatter.title`.
- **Grid 2 colunas** (`xl:grid-cols-[1fr_360px]`, empilha no mobile):
  - **Conteúdo (esquerda):** header com label "Conteúdo" + `<EditorTabs>` (Editar/Dividir/Pré-visualizar) à direita. Abaixo, conforme a aba:
    - `edit` → `<MdxToolbar>` + `<MdxEditor>` (full width).
    - `split` → `<MdxToolbar>` + `<MdxEditor>` | `<MdxPreview>` (lado a lado).
    - `preview` → `<MdxPreview>` (full width).
  - **Sidebar (direita):** 4 cards (abaixo).

Estado local: `body`, `frontmatter` (`fm`), `errors`, `slugTouched` (lógica de auto-slug do slice ③ preservada), e novo `tab: 'edit' | 'split' | 'preview'` (default `edit`). O `EditorView` do CodeMirror é exposto via ref pra toolbar agir.

### 3.2 Toolbar (`mdx-toolbar.tsx` — novo)

Botões: **H2** (`## `), **B** (`**…**`), **I** (`_…_`), **aspas** (`> `), **código** (`` `…` ``), **lista** (`- `), **link** (`[texto](url)`). Cada botão age sobre a seleção atual do CodeMirror:

- _wrap_ (B/I/código): envolve a seleção com o marcador (ou insere o par vazio com cursor no meio).
- _prefixo de linha_ (H2/aspas/lista): prefixa a(s) linha(s) da seleção.
- _link_: envolve a seleção em `[seleção](url)` (cursor na url).

Implementação: a toolbar recebe um `editorRef` (`MutableRefObject<EditorView | null>`) e despacha transações (`view.dispatch({ changes, selection })`). Lógica de transformação de texto isolada numa lib pura `lib/admin/mdx-toolbar-actions.ts` (testável em Jest sem CodeMirror): funções `wrapSelection(doc, from, to, before, after)` e `prefixLines(doc, from, to, prefix)` que retornam `{ insert, newSelection }`. A toolbar só faz a ponte com o `EditorView`.

### 3.3 Editor (`mdx-editor.tsx` — ajustado)

- `basicSetup.lineNumbers: false`.
- Expõe o `EditorView` via `onCreateEditor` → `props.onReady(view)` (ou um `ref`). O `post-editor` guarda essa ref e passa pra `<MdxToolbar>`.
- Resto igual (markdown, tema dark, height 100%).

### 3.4 Sidebar — cards (componentes puros, novos)

Quebra o `post-frontmatter-form` (que sai) em cards DS V2 (`bg-card`, `rounded-[var(--radius)]`, label mono `tracking-[0.2em] uppercase`):

- **`post-publish-card.tsx`** — "PUBLICAÇÃO": `ToggleField` rotulado **"Publicado"** (`checked = !draft`, `onChange(v) → draft = !v`); **Data** (`TextField` `publishedAt`, placeholder ISO); **Leitura** (`TextField` numérico `readingTimeMinutes` + sufixo "min"); botão **"Salvar alterações"** (`Button`, `pending`). Recebe `value`/`onChange`/`onSave`/`pending`/`errors`.
- **`post-meta-card.tsx`** — "METADADOS": Slug (`TextField`, `slugEditable`) + Resumo (`TextareaField` `excerpt`).
- **TAGS** — card simples reusando `TagArrayInput` (sem componente novo; um wrapper inline no `post-editor` com o header "TAGS").
- **`cover-image-card.tsx`** — "IMAGEM DE CAPA": embrulha `<CoverImageDropzone>`.

> Os cards são puros (recebem `value`/`onChange`/handlers por prop) → têm stories. O wiring (estado) fica no `post-editor`.

### 3.5 Dropzone de capa (`cover-image-dropzone.tsx` — novo)

- Zona de drag-and-drop + "browse files" (input file escondido) → no drop/seleção chama `useMediaMutations().upload` com `fileToUpload(file)` → seta `coverImage = res.path` (`/media/<file>`) + `toast`.
- **Preview** via `mediaRawUrl(coverImage)` (raw GitHub, imediato).
- Botão **"Biblioteca"** → abre `MediaPickerDialog` (escolher seta o path).
- Input de texto opcional pra path/URL manual (compat com capas externas/legadas).
- Estados: vazio (mostra "Arraste a capa ou browse files"), enviando (spinner), com-imagem (preview + trocar/remover).

### 3.6 Schema (`lib/admin/post-schema.ts` — +1 campo)

- Adicionar `readingTimeMinutes: z.number().int().min(0).default(0)` ao `postFrontmatterSchema` + à lista `KNOWN_KEYS`. (Frontmatter dos posts pode já ter `readingTimeMinutes` — passa a ser editável; ausente → 0 → auto-sugerido.)
- Lib pura `lib/admin/reading-time.ts` `estimateReadingTime(body: string): number` → `Math.max(1, Math.round(words/200))` (words = split por whitespace, ignora fences/marcadores de forma simples). Usada pelo `post-editor` pra sugerir quando `readingTimeMinutes` é 0/vazio (não sobrescreve um valor já setado).

### 3.7 EditorTabs (`mdx-editor.tsx` ou inline)

Um switcher de 3 botões (pílulas, ativo `bg-primary text-primary-foreground`) controlado por `tab`. Pequeno — pode ser um componente inline no `post-editor` ou `editor-tabs.tsx` (com story). Decisão: `editor-tabs.tsx` (puro, com story).

---

## 4. UI (DS V2)

Segue os tokens do projeto: cards `bg-card border-border rounded-[var(--radius)]`, labels de seção mono `text-muted-foreground text-xs tracking-[0.2em] uppercase`, primário ciano (`bg-primary`), toolbar/abas como pílulas. O título usa `text-3xl font-bold` num card. O CodeMirror e o `.post-prose` (preview) reusam o estilo existente. Botão "Salvar alterações" primário no card Publicação.

---

## 5. Testes

- **Jest (lib pura):** `reading-time.ts` (`estimateReadingTime`) e `mdx-toolbar-actions.ts` (`wrapSelection`/`prefixLines` — entrada/saída de texto sem CodeMirror).
- **Storybook (todo componente novo + estados):** `editor-tabs` (3 estados), `mdx-toolbar`, `post-publish-card` (rascunho/publicado, com erro), `post-meta-card`, `cover-image-card` (vazio/com-imagem), `cover-image-dropzone` (vazio/enviando/com-imagem), e o `post-editor` (aba edit/split/preview) — **critério de aceite**.
- **E2E (`app/(admin)/admin/posts/editor.e2e.ts` atualizado):** trocar entre as 3 abas (assert que o preview/split aparece), a toolbar insere markdown no editor, salvar pelo card Publicação (mock do PUT), e o dropzone de capa (upload mockado → seta path). Mocks host-agnósticos + os do shell.
- **Gates:** `tsc --noEmit`, `lint`, `pnpm test` (Jest), `build:ci`, E2E afetados.

---

## 6. Fora de escopo / riscos

- **Toolbar + CodeMirror:** a ponte com o `EditorView` (ref) é o ponto mais delicado; a lógica de texto fica numa lib pura testável pra reduzir risco.
- **Sem migração de conteúdo:** posts existentes sem `readingTimeMinutes` → 0 → auto-sugerido na abertura (não grava até salvar).
- **Dropzone depende da rota de mídia** (slice ④) e do prefixo `apps/web/public/media` (já corrigido). Capa é gravada em `/media/<file>` no campo.
- **Sem mudança no público:** o render dos posts no site (`app/(site)/posts/[slug]`) não é tocado.

---

## 7. Critérios de aceite

1. O editor (`/admin/posts/{novo,[slug]}`) bate com os mockups: título grande no topo, abas **Editar/Dividir/Pré-visualizar** com toolbar, sidebar com os 4 cards (Publicação/Metadados/Tags/Imagem de capa).
2. Toolbar insere/envolve markdown na seleção do CodeMirror (H2/B/I/aspas/código/lista/link).
3. Toggle "Publicado" reflete `!draft`; "Salvar alterações" no card Publicação grava (mesma validação Zod), e a navegação de slug/auto-slug do slice ③ segue funcionando.
4. Card "Imagem de capa": arrastar/escolher faz **upload** (grava em `apps/web/public/media`) e seta `/media/<file>`; Biblioteca e path manual também funcionam; preview aparece.
5. Campo "Leitura" editável; auto-sugere de `≈ palavras/200` quando vazio; preserva valor existente.
6. **Todo componente novo tem `.stories.tsx` colocado.**
7. `lint`, `tsc --noEmit`, Jest, E2E passam; `build:ci` compila.
8. CLAUDE.md atualizado (seção "Blog (posts)" / Slice ③ refletindo o novo editor).
