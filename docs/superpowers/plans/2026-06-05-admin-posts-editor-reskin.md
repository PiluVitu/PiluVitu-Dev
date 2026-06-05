# Reskin do editor de posts (DS V2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-desenhar o editor de posts (`/admin/posts/{novo,[slug]}`) para o visual dos mockups — título grande no topo, abas Editar/Dividir/Pré-visualizar + toolbar, e sidebar em cards (Publicação/Metadados/Tags/Imagem de capa) — sem mexer no IO de posts.

**Architecture:** Lógica de texto/leitura em libs puras testáveis (`mdx-toolbar-actions`, `reading-time`). UI quebrada em componentes pequenos com story (`editor-tabs`, `mdx-toolbar`, `sidebar-card`, `post-publish-card`, `post-meta-card`, `cover-image-card`). O `post-editor` reescreve só o layout e faz o wiring; o `mdx-editor` (CodeMirror) ganha `onReady(view)` pra toolbar agir via `EditorView`.

**Tech Stack:** Next 16 App Router, React 19, `@uiw/react-codemirror` (+ `@codemirror/view` `EditorView`), Zod, `@dnd`-free drag nativo, hooks de mídia do slice ④, Jest + Storybook + Playwright.

**Branch:** `feat/admin-posts-editor-reskin` (de `origin/main`).
**Spec:** `docs/superpowers/specs/2026-06-05-admin-posts-editor-reskin-design.md`

---

## File Structure

**Libs puras (criar + test):**

- `apps/web/lib/admin/reading-time.ts` — `estimateReadingTime(body)`.
- `apps/web/lib/admin/mdx-toolbar-actions.ts` — `wrapSelection`/`prefixLines`/`linkSelection` (texto puro).

**Schema (modificar):**

- `apps/web/lib/admin/post-schema.ts` — `+readingTimeMinutes` + `KNOWN_KEYS`.
- `apps/web/app/(admin)/admin/posts/novo/page.tsx` — `EMPTY_FM` ganha `readingTimeMinutes: 0`.

**Componentes (criar, cada um com `.stories.tsx`):**

- `editor-tabs.tsx` — switcher Editar/Dividir/Pré-visualizar.
- `mdx-toolbar.tsx` — toolbar que age no `EditorView`.
- `sidebar-card.tsx` — card titulado (chrome reusável).
- `post-publish-card.tsx` — Publicado/Data/Leitura/Salvar.
- `post-meta-card.tsx` — Slug/Resumo.
- `cover-image-card.tsx` — dropzone + Biblioteca + path manual.

**Componentes (modificar):**

- `mdx-editor.tsx` — `lineNumbers:false` + `onReady(view)`.
- `post-editor.tsx` — reescrita do layout (título topo, abas, sidebar de cards).

**Remover:**

- `post-frontmatter-form.tsx` (+ `.stories.tsx`) — substituído pelos cards.

**Testes/Docs:**

- `app/(admin)/admin/posts/editor.e2e.ts` — abas/toolbar/salvar-pelo-card/dropzone + mock com `readingTimeMinutes`.
- `CLAUDE.md` — seção Blog/Slice ③.

Todos em `apps/web`. As páginas `[slug]/page.tsx` e `novo/page.tsx` **não mudam** a forma de chamar o `PostEditor` (mesmas props) — só o `EMPTY_FM` do novo ganha o campo.

---

## Task 1: Campo `readingTimeMinutes` + lib `reading-time`

**Files:** Create `apps/web/lib/admin/reading-time.ts` + `reading-time.test.ts`; Modify `apps/web/lib/admin/post-schema.ts`, `apps/web/app/(admin)/admin/posts/novo/page.tsx`.

- [ ] **Step 1: Teste de `estimateReadingTime` (falha)**

Create `apps/web/lib/admin/reading-time.test.ts`:

```ts
import { estimateReadingTime } from './reading-time'

describe('estimateReadingTime', () => {
  it('texto curto → 1 min', () => {
    expect(estimateReadingTime('hello world')).toBe(1)
  })
  it('vazio → 1 min', () => {
    expect(estimateReadingTime('')).toBe(1)
  })
  it('~200 palavras/min', () => {
    const words = Array.from({ length: 600 }, () => 'palavra').join(' ')
    expect(estimateReadingTime(words)).toBe(3)
  })
})
```

- [ ] **Step 2: Roda e confirma a falha**

Run: `cd apps/web && pnpm exec jest reading-time`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementa `reading-time.ts`**

Create `apps/web/lib/admin/reading-time.ts`:

```ts
/** Estima o tempo de leitura em minutos (~200 palavras/min, mínimo 1). */
export function estimateReadingTime(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}
```

- [ ] **Step 4: Roda e confirma o verde**

Run: `cd apps/web && pnpm exec jest reading-time`
Expected: PASS (3 testes).

- [ ] **Step 5: Adiciona `readingTimeMinutes` ao schema**

In `apps/web/lib/admin/post-schema.ts`, dentro de `postFrontmatterSchema` (após `draft`):

```ts
  draft: z.boolean().default(false),
  readingTimeMinutes: z.number().int().min(0).default(0),
})
```

E em `KNOWN_KEYS` adiciona `'readingTimeMinutes'`:

```ts
const KNOWN_KEYS: (keyof PostFrontmatter)[] = [
  'title',
  'slug',
  'excerpt',
  'coverImage',
  'tags',
  'publishedAt',
  'draft',
  'readingTimeMinutes',
]
```

- [ ] **Step 6: Corrige o `EMPTY_FM` do novo post (senão TS quebra)**

In `apps/web/app/(admin)/admin/posts/novo/page.tsx`, no objeto `EMPTY_FM` adiciona `readingTimeMinutes: 0`:

```ts
const EMPTY_FM: PostFrontmatter = {
  title: '',
  slug: '',
  excerpt: '',
  coverImage: '',
  tags: [],
  publishedAt: '',
  draft: true,
  readingTimeMinutes: 0,
}
```

- [ ] **Step 7: Type-check + lint + commit**

Run: `cd apps/web && pnpm exec tsc --noEmit && pnpm lint`
Expected: sem erros.

```bash
git add apps/web/lib/admin/reading-time.ts apps/web/lib/admin/reading-time.test.ts apps/web/lib/admin/post-schema.ts "apps/web/app/(admin)/admin/posts/novo/page.tsx"
git commit -m "feat(admin): readingTimeMinutes no frontmatter + estimateReadingTime"
```

---

## Task 2: Lib pura `mdx-toolbar-actions`

**Files:** Create `apps/web/lib/admin/mdx-toolbar-actions.ts` + `mdx-toolbar-actions.test.ts`.

- [ ] **Step 1: Testes (falham)**

Create `apps/web/lib/admin/mdx-toolbar-actions.test.ts`:

```ts
import {
  wrapSelection,
  prefixLines,
  linkSelection,
} from './mdx-toolbar-actions'

describe('wrapSelection', () => {
  it('envolve a seleção', () => {
    const r = wrapSelection('foo bar baz', 4, 7, '**', '**')
    expect(r.text).toBe('foo **bar** baz')
    expect(r.text.slice(r.selFrom, r.selTo)).toBe('bar')
  })
  it('insere o par com seleção vazia, cursor no meio', () => {
    const r = wrapSelection('ab', 1, 1, '`', '`')
    expect(r.text).toBe('a``b')
    expect(r.selFrom).toBe(2)
    expect(r.selTo).toBe(2)
  })
})

describe('prefixLines', () => {
  it('prefixa a linha tocada', () => {
    const r = prefixLines('linha um\nlinha dois', 2, 2, '## ')
    expect(r.text).toBe('## linha um\nlinha dois')
  })
  it('prefixa várias linhas selecionadas', () => {
    const r = prefixLines('a\nb', 0, 3, '- ')
    expect(r.text).toBe('- a\n- b')
  })
})

describe('linkSelection', () => {
  it('vira [seleção](url) com o cursor na url', () => {
    const r = linkSelection('veja aqui', 5, 9)
    expect(r.text).toBe('veja [aqui](url)')
    expect(r.text.slice(r.selFrom, r.selTo)).toBe('url')
  })
})
```

- [ ] **Step 2: Roda e confirma falha**

Run: `cd apps/web && pnpm exec jest mdx-toolbar-actions`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementa**

Create `apps/web/lib/admin/mdx-toolbar-actions.ts`:

```ts
export interface EditResult {
  text: string
  selFrom: number
  selTo: number
}

/** Envolve [from,to) com `before`/`after`. Seleção vazia → insere o par com cursor no meio. */
export function wrapSelection(
  doc: string,
  from: number,
  to: number,
  before: string,
  after: string,
): EditResult {
  const sel = doc.slice(from, to)
  const text = doc.slice(0, from) + before + sel + after + doc.slice(to)
  const selFrom = from + before.length
  return { text, selFrom, selTo: selFrom + sel.length }
}

/** Prefixa cada linha tocada por [from,to) com `prefix`. */
export function prefixLines(
  doc: string,
  from: number,
  to: number,
  prefix: string,
): EditResult {
  const lineStart = doc.lastIndexOf('\n', from - 1) + 1
  const nextNl = doc.indexOf('\n', to)
  const lineEnd = nextNl === -1 ? doc.length : nextNl
  const block = doc.slice(lineStart, lineEnd)
  const prefixed = block
    .split('\n')
    .map((l) => prefix + l)
    .join('\n')
  const text = doc.slice(0, lineStart) + prefixed + doc.slice(lineEnd)
  return { text, selFrom: lineStart, selTo: lineStart + prefixed.length }
}

/** Vira `[seleção](url)`; cursor pousa em "url". */
export function linkSelection(
  doc: string,
  from: number,
  to: number,
): EditResult {
  const sel = doc.slice(from, to) || 'texto'
  const inserted = `[${sel}](url)`
  const text = doc.slice(0, from) + inserted + doc.slice(to)
  const urlStart = from + 1 + sel.length + 2 // `[` + sel + `](`
  return { text, selFrom: urlStart, selTo: urlStart + 3 }
}
```

- [ ] **Step 4: Roda e confirma verde**

Run: `cd apps/web && pnpm exec jest mdx-toolbar-actions`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/mdx-toolbar-actions.ts apps/web/lib/admin/mdx-toolbar-actions.test.ts
git commit -m "feat(admin): ações puras de markdown (wrap/prefix/link) pra toolbar"
```

---

## Task 3: `mdx-editor` sem nº de linha + `onReady`

**Files:** Modify `apps/web/components/admin/posts/mdx-editor.tsx`.

- [ ] **Step 1: Reescreve o componente**

Replace `apps/web/components/admin/posts/mdx-editor.tsx` por:

```tsx
'use client'

import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import type { EditorView } from '@codemirror/view'

export function MdxEditor(props: {
  value: string
  onChange: (v: string) => void
  onReady?: (view: EditorView) => void
}) {
  return (
    <div className="h-full overflow-hidden">
      <CodeMirror
        value={props.value}
        onChange={props.onChange}
        extensions={[markdown()]}
        theme="dark"
        height="100%"
        style={{ height: '100%' }}
        onCreateEditor={(view) => props.onReady?.(view)}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
        }}
      />
    </div>
  )
}
```

> Mudanças: `lineNumbers: false`, `onCreateEditor` repassa o `EditorView` via `onReady`, e o wrapper perde a borda (o `post-editor` passa a controlar a borda do container toolbar+editor).

- [ ] **Step 2: Atualiza a story (sem nº de linha ainda renderiza)**

`mdx-editor.stories.tsx` já existe; confirme que compila (a prop `onReady` é opcional). Se a story passa `value`/`onChange`, segue válida. Rode tsc.

- [ ] **Step 3: Type-check + lint + commit**

Run: `cd apps/web && pnpm exec tsc --noEmit && pnpm lint`

```bash
git add apps/web/components/admin/posts/mdx-editor.tsx
git commit -m "feat(admin): mdx-editor sem nº de linha + expõe EditorView (onReady)"
```

---

## Task 4: `editor-tabs` + story

**Files:** Create `apps/web/components/admin/posts/editor-tabs.tsx` + `editor-tabs.stories.tsx`.

- [ ] **Step 1: Componente**

```tsx
'use client'

export type EditorTab = 'edit' | 'split' | 'preview'

const TABS: { value: EditorTab; label: string }[] = [
  { value: 'edit', label: 'Editar' },
  { value: 'split', label: 'Dividir' },
  { value: 'preview', label: 'Pré-visualizar' },
]

export function EditorTabs(props: {
  value: EditorTab
  onChange: (t: EditorTab) => void
}) {
  return (
    <div className="border-border bg-muted/40 rounded-pill inline-flex gap-1 border p-1">
      {TABS.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => props.onChange(t.value)}
          className={`rounded-pill px-3 py-1 text-xs font-medium transition-colors ${
            props.value === t.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Story**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { EditorTabs } from './editor-tabs'

const meta: Meta<typeof EditorTabs> = {
  title: 'Admin/Posts/EditorTabs',
  component: EditorTabs,
  parameters: { layout: 'padded' },
  args: { onChange: fn() },
}
export default meta
type Story = StoryObj<typeof EditorTabs>

export const Editar: Story = { args: { value: 'edit' } }
export const Dividir: Story = { args: { value: 'split' } }
export const Preview: Story = { args: { value: 'preview' } }
```

- [ ] **Step 3: tsc + lint + commit**

```bash
cd apps/web && pnpm exec tsc --noEmit && pnpm lint
git add apps/web/components/admin/posts/editor-tabs.tsx apps/web/components/admin/posts/editor-tabs.stories.tsx
git commit -m "feat(admin): EditorTabs (Editar/Dividir/Pré-visualizar)"
```

---

## Task 5: `mdx-toolbar` + story

**Files:** Create `apps/web/components/admin/posts/mdx-toolbar.tsx` + `mdx-toolbar.stories.tsx`.

- [ ] **Step 1: Componente**

```tsx
'use client'

import type { MutableRefObject } from 'react'
import type { EditorView } from '@codemirror/view'
import {
  wrapSelection,
  prefixLines,
  linkSelection,
  type EditResult,
} from '@/lib/admin/mdx-toolbar-actions'

type Action = (doc: string, from: number, to: number) => EditResult

const BUTTONS: { label: string; title: string; fn: Action }[] = [
  {
    label: 'H2',
    title: 'Título',
    fn: (d, f, t) => prefixLines(d, f, t, '## '),
  },
  {
    label: 'B',
    title: 'Negrito',
    fn: (d, f, t) => wrapSelection(d, f, t, '**', '**'),
  },
  {
    label: 'I',
    title: 'Itálico',
    fn: (d, f, t) => wrapSelection(d, f, t, '_', '_'),
  },
  { label: '❝', title: 'Citação', fn: (d, f, t) => prefixLines(d, f, t, '> ') },
  {
    label: '</>',
    title: 'Código',
    fn: (d, f, t) => wrapSelection(d, f, t, '`', '`'),
  },
  { label: '•', title: 'Lista', fn: (d, f, t) => prefixLines(d, f, t, '- ') },
  { label: '🔗', title: 'Link', fn: linkSelection },
]

export function MdxToolbar(props: {
  editorRef: MutableRefObject<EditorView | null>
}) {
  const apply = (fn: Action) => {
    const view = props.editorRef.current
    if (!view) return
    const { from, to } = view.state.selection.main
    const { text, selFrom, selTo } = fn(view.state.doc.toString(), from, to)
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      selection: { anchor: selFrom, head: selTo },
    })
    view.focus()
  }
  return (
    <div className="border-border bg-muted/30 flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
      {BUTTONS.map((b) => (
        <button
          key={b.title}
          type="button"
          title={b.title}
          aria-label={b.title}
          // mousedown + preventDefault: não tira o foco/seleção do editor antes de aplicar
          onMouseDown={(e) => {
            e.preventDefault()
            apply(b.fn)
          }}
          className="text-muted-foreground hover:bg-muted hover:text-foreground rounded px-2 py-1 font-mono text-xs"
        >
          {b.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Story** (ref nula → renderiza visual, botões no-op)

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { MdxToolbar } from './mdx-toolbar'

const meta: Meta<typeof MdxToolbar> = {
  title: 'Admin/Posts/MdxToolbar',
  component: MdxToolbar,
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof MdxToolbar>

export const Default: Story = { args: { editorRef: { current: null } } }
```

- [ ] **Step 3: tsc + lint + commit**

```bash
cd apps/web && pnpm exec tsc --noEmit && pnpm lint
git add apps/web/components/admin/posts/mdx-toolbar.tsx apps/web/components/admin/posts/mdx-toolbar.stories.tsx
git commit -m "feat(admin): MdxToolbar (insere markdown na seleção do CodeMirror)"
```

---

## Task 6: `sidebar-card` (chrome reusável) + story

**Files:** Create `apps/web/components/admin/posts/sidebar-card.tsx` + `sidebar-card.stories.tsx`.

- [ ] **Step 1: Componente**

```tsx
import type { ReactNode } from 'react'

export function SidebarCard(props: { title: string; children: ReactNode }) {
  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-[var(--radius)] border p-4">
      <h3 className="text-muted-foreground font-mono text-xs font-semibold tracking-[0.2em] uppercase">
        {props.title}
      </h3>
      {props.children}
    </section>
  )
}
```

- [ ] **Step 2: Story**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { SidebarCard } from './sidebar-card'

const meta: Meta<typeof SidebarCard> = {
  title: 'Admin/Posts/SidebarCard',
  component: SidebarCard,
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof SidebarCard>

export const Default: Story = {
  args: { title: 'Publicação', children: 'conteúdo do card' },
}
```

- [ ] **Step 3: tsc + lint + commit**

```bash
cd apps/web && pnpm exec tsc --noEmit && pnpm lint
git add apps/web/components/admin/posts/sidebar-card.tsx apps/web/components/admin/posts/sidebar-card.stories.tsx
git commit -m "feat(admin): SidebarCard (chrome dos cards do editor de posts)"
```

---

## Task 7: `post-publish-card` + `post-meta-card` + stories

**Files:** Create `apps/web/components/admin/posts/post-publish-card.tsx` (+ story) e `post-meta-card.tsx` (+ story).

- [ ] **Step 1: `post-publish-card.tsx`**

```tsx
'use client'

import { TextField, ToggleField } from '@/components/admin/content/fields'
import { Button } from '@/components/ui/button'
import type { PostFrontmatter } from '@/lib/admin/post-schema'
import { SidebarCard } from './sidebar-card'

export function PostPublishCard(props: {
  value: PostFrontmatter
  onChange: (v: PostFrontmatter) => void
  onSave: () => void
  pending?: boolean
  errors?: Record<string, string>
}) {
  const d = props.value
  const set = <K extends keyof PostFrontmatter>(k: K, v: PostFrontmatter[K]) =>
    props.onChange({ ...d, [k]: v })
  return (
    <SidebarCard title="Publicação">
      <ToggleField
        label="Publicado"
        checked={!d.draft}
        onChange={(v) => set('draft', !v)}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Data"
          value={d.publishedAt}
          onChange={(v) => set('publishedAt', v)}
          placeholder="2025-04-28"
          error={props.errors?.publishedAt}
        />
        <TextField
          label="Leitura (min)"
          value={d.readingTimeMinutes ? String(d.readingTimeMinutes) : ''}
          onChange={(v) =>
            set('readingTimeMinutes', Number(v.replace(/\D/g, '')) || 0)
          }
          placeholder="5"
        />
      </div>
      <Button
        onClick={props.onSave}
        disabled={props.pending}
        className="w-full"
      >
        {props.pending ? 'Salvando…' : 'Salvar alterações'}
      </Button>
    </SidebarCard>
  )
}
```

- [ ] **Step 2: `post-publish-card.stories.tsx`**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { PostPublishCard } from './post-publish-card'

const base = {
  title: 'T',
  slug: 't',
  excerpt: '',
  coverImage: '',
  tags: [],
  publishedAt: '2025-04-28',
  draft: false,
  readingTimeMinutes: 5,
}

const meta: Meta<typeof PostPublishCard> = {
  title: 'Admin/Posts/PostPublishCard',
  component: PostPublishCard,
  parameters: { layout: 'padded' },
  args: { onChange: fn(), onSave: fn() },
}
export default meta
type Story = StoryObj<typeof PostPublishCard>

export const Publicado: Story = { args: { value: base } }
export const Rascunho: Story = { args: { value: { ...base, draft: true } } }
export const Salvando: Story = { args: { value: base, pending: true } }
```

- [ ] **Step 3: `post-meta-card.tsx`**

```tsx
'use client'

import { TextField, TextareaField } from '@/components/admin/content/fields'
import type { PostFrontmatter } from '@/lib/admin/post-schema'
import { SidebarCard } from './sidebar-card'

export function PostMetaCard(props: {
  value: PostFrontmatter
  onChange: (v: PostFrontmatter) => void
  slugEditable: boolean
  errors?: Record<string, string>
}) {
  const d = props.value
  const set = <K extends keyof PostFrontmatter>(k: K, v: PostFrontmatter[K]) =>
    props.onChange({ ...d, [k]: v })
  return (
    <SidebarCard title="Metadados">
      <TextField
        label="Slug"
        value={d.slug}
        onChange={(v) => props.slugEditable && set('slug', v)}
        error={props.errors?.slug}
      />
      <TextareaField
        label="Resumo"
        value={d.excerpt}
        onChange={(v) => set('excerpt', v)}
        rows={3}
      />
    </SidebarCard>
  )
}
```

- [ ] **Step 4: `post-meta-card.stories.tsx`**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { PostMetaCard } from './post-meta-card'

const meta: Meta<typeof PostMetaCard> = {
  title: 'Admin/Posts/PostMetaCard',
  component: PostMetaCard,
  parameters: { layout: 'padded' },
  args: { onChange: fn(), slugEditable: true },
}
export default meta
type Story = StoryObj<typeof PostMetaCard>

export const Default: Story = {
  args: {
    value: {
      title: 'T',
      slug: 'como-usar-o-husky',
      excerpt: 'Resumo do post.',
      coverImage: '',
      tags: [],
      publishedAt: '',
      draft: false,
      readingTimeMinutes: 5,
    },
  },
}
```

- [ ] **Step 5: tsc + lint + commit**

```bash
cd apps/web && pnpm exec tsc --noEmit && pnpm lint
git add apps/web/components/admin/posts/post-publish-card.tsx apps/web/components/admin/posts/post-publish-card.stories.tsx apps/web/components/admin/posts/post-meta-card.tsx apps/web/components/admin/posts/post-meta-card.stories.tsx
git commit -m "feat(admin): cards Publicação + Metadados do editor de posts"
```

---

## Task 8: `cover-image-card` (dropzone + Biblioteca) + story

**Files:** Create `apps/web/components/admin/posts/cover-image-card.tsx` + `cover-image-card.stories.tsx`.

- [ ] **Step 1: Componente**

```tsx
'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { mediaRawUrl } from '@/lib/admin/media-url'
import {
  useMediaMutations,
  fileToUpload,
} from '@/hooks/admin/media/use-media-mutations'
import { MediaPickerDialog } from '@/components/admin/media/media-picker-dialog'
import { SidebarCard } from './sidebar-card'

export function CoverImageCard(props: {
  value: string
  onChange: (v: string) => void
}) {
  const { upload } = useMediaMutations()
  const fileRef = useRef<HTMLInputElement>(null)
  const [picker, setPicker] = useState(false)

  const onFile = async (file: File) => {
    try {
      const res = await upload.mutateAsync(await fileToUpload(file))
      props.onChange(res.path)
      toast.success('Capa enviada')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <SidebarCard title="Imagem de capa">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files?.[0]
          if (f) void onFile(f)
        }}
        onClick={() => fileRef.current?.click()}
        className="border-border bg-muted/20 grid min-h-28 cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed p-3 text-center"
      >
        {props.value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaRawUrl(props.value)}
            alt=""
            className="max-h-32 max-w-full object-contain"
          />
        ) : (
          <p className="text-muted-foreground text-xs">
            {upload.isPending
              ? 'Enviando…'
              : 'Arraste a capa ou clique para enviar'}
          </p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onFile(f)
            e.target.value = ''
          }}
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPicker(true)}
        >
          Biblioteca
        </Button>
        {props.value ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => props.onChange('')}
          >
            Remover
          </Button>
        ) : null}
      </div>
      <input
        className="border-border bg-muted/40 text-foreground placeholder:text-muted-foreground focus:border-primary w-full rounded-lg border px-3 py-2 text-xs outline-none"
        value={props.value}
        placeholder="/media/… ou URL"
        onChange={(e) => props.onChange(e.target.value)}
      />
      <MediaPickerDialog
        open={picker}
        onOpenChange={setPicker}
        onPick={(path) => props.onChange(path)}
      />
    </SidebarCard>
  )
}
```

> Confirme os imports lendo `hooks/admin/media/use-media-mutations.ts` (`useMediaMutations`, `fileToUpload`) e `components/admin/media/media-picker-dialog.tsx` (`MediaPickerDialog` com props `open`/`onOpenChange`/`onPick`). Se divergirem, adapte.

- [ ] **Step 2: Story** (estados via `value`; upload não dispara no Storybook, ok)

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { CoverImageCard } from './cover-image-card'

const meta: Meta<typeof CoverImageCard> = {
  title: 'Admin/Posts/CoverImageCard',
  component: CoverImageCard,
  parameters: { layout: 'padded' },
  args: { onChange: fn() },
}
export default meta
type Story = StoryObj<typeof CoverImageCard>

export const Vazio: Story = { args: { value: '' } }
export const ComImagem: Story = { args: { value: '/media/capa.png' } }
```

- [ ] **Step 3: tsc + lint + commit**

```bash
cd apps/web && pnpm exec tsc --noEmit && pnpm lint
git add apps/web/components/admin/posts/cover-image-card.tsx apps/web/components/admin/posts/cover-image-card.stories.tsx
git commit -m "feat(admin): CoverImageCard (dropzone upload + Biblioteca + path manual)"
```

---

## Task 9: Reescrita do `post-editor` + remoção do `post-frontmatter-form`

**Files:** Rewrite `apps/web/components/admin/posts/post-editor.tsx`; Delete `apps/web/components/admin/posts/post-frontmatter-form.tsx` (+ `.stories.tsx`).

- [ ] **Step 1: Reescreve `post-editor.tsx`**

```tsx
'use client'

import { useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { PageTopBar } from '@/components/page-top-bar'
import { TagArrayInput } from '@/components/admin/content/tag-array-input'
import {
  postFrontmatterSchema,
  type PostFrontmatter,
} from '@/lib/admin/post-schema'
import { slugify } from '@/lib/admin/slugify'
import { estimateReadingTime } from '@/lib/admin/reading-time'
import { MdxEditor } from './mdx-editor'
import { MdxPreview } from './mdx-preview'
import { MdxToolbar } from './mdx-toolbar'
import { EditorTabs, type EditorTab } from './editor-tabs'
import { SidebarCard } from './sidebar-card'
import { PostPublishCard } from './post-publish-card'
import { PostMetaCard } from './post-meta-card'
import { CoverImageCard } from './cover-image-card'

export function PostEditor(props: {
  mode: 'create' | 'edit'
  initialFrontmatter: PostFrontmatter
  initialBody: string
  pending?: boolean
  onSave: (fm: PostFrontmatter, body: string) => void
}) {
  const [fm, setFm] = useState<PostFrontmatter>(props.initialFrontmatter)
  const [body, setBody] = useState(props.initialBody)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [slugTouched, setSlugTouched] = useState(props.mode === 'edit')
  const [tab, setTab] = useState<EditorTab>('edit')
  const editorRef = useRef<EditorView | null>(null)
  const isCreate = props.mode === 'create'

  // On create, o slug auto-deriva do título até o usuário editá-lo manualmente.
  const displaySlug = isCreate && !slugTouched ? slugify(fm.title) : fm.slug

  const handleFm = (next: PostFrontmatter) => {
    if (isCreate && !slugTouched && next.slug !== displaySlug) {
      setSlugTouched(true)
      setFm(next)
      return
    }
    setFm({ ...next, slug: !isCreate || slugTouched ? next.slug : '' })
  }

  const save = () => {
    const finalSlug = isCreate && !slugTouched ? slugify(fm.title) : fm.slug
    const reading = fm.readingTimeMinutes || estimateReadingTime(body)
    const parsed = postFrontmatterSchema.safeParse({
      ...fm,
      slug: finalSlug,
      readingTimeMinutes: reading,
    })
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
        ),
      )
      return
    }
    setErrors({})
    props.onSave(parsed.data, body)
  }

  return (
    <div className="flex flex-col gap-5">
      <PageTopBar backHref="/admin/posts" backLabel="Posts" />

      <input
        aria-label="Título"
        className="border-border bg-card text-foreground focus:border-primary w-full rounded-[var(--radius)] border px-5 py-4 text-3xl font-bold outline-none"
        placeholder="Título do post"
        value={fm.title}
        onChange={(e) => handleFm({ ...fm, title: e.target.value })}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px] xl:items-start">
        {/* Conteúdo */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground font-mono text-xs tracking-[0.2em] uppercase">
              Conteúdo
            </span>
            <EditorTabs value={tab} onChange={setTab} />
          </div>

          {tab === 'preview' ? (
            <div className="border-border h-[60vh] overflow-hidden rounded-[var(--radius)] border">
              <MdxPreview mdx={body} />
            </div>
          ) : (
            <div className="border-border overflow-hidden rounded-[var(--radius)] border">
              <MdxToolbar editorRef={editorRef} />
              <div
                className={
                  tab === 'split'
                    ? 'grid h-[60vh] grid-cols-2 divide-x divide-[var(--color-border)]'
                    : 'h-[60vh]'
                }
              >
                <MdxEditor
                  value={body}
                  onChange={setBody}
                  onReady={(v) => (editorRef.current = v)}
                />
                {tab === 'split' ? <MdxPreview mdx={body} /> : null}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-4">
          <PostPublishCard
            value={fm}
            onChange={setFm}
            onSave={save}
            pending={props.pending}
            errors={errors}
          />
          <PostMetaCard
            value={{ ...fm, slug: displaySlug }}
            onChange={handleFm}
            slugEditable={isCreate}
            errors={errors}
          />
          <SidebarCard title="Tags">
            <TagArrayInput
              label=""
              values={fm.tags}
              onChange={(v) => setFm({ ...fm, tags: v })}
            />
          </SidebarCard>
          <CoverImageCard
            value={fm.coverImage}
            onChange={(v) => setFm({ ...fm, coverImage: v })}
          />
        </div>
      </div>
    </div>
  )
}
```

> Nota: `MdxPreview` interno tem `h-full overflow-y-auto` — dentro do container `h-[60vh]` fica certo. O `divide-x` no split separa editor/preview. Faça um ajuste visual fino se necessário (o objetivo é bater com os mockups), mas mantenha a estrutura/props.

- [ ] **Step 2: Remove o `post-frontmatter-form`**

```bash
cd apps/web
git rm components/admin/posts/post-frontmatter-form.tsx
git rm components/admin/posts/post-frontmatter-form.stories.tsx
```

(Se houver `post-frontmatter-form.test.tsx`, remova também: `git rm` nele.)

- [ ] **Step 3: Confirma que nada mais importa o form removido**

Run: `cd apps/web && grep -rn "post-frontmatter-form\|PostFrontmatterForm" --include=*.ts --include=*.tsx . | grep -v node_modules || echo CLEAN`
Expected: `CLEAN`.

- [ ] **Step 4: tsc + lint + commit**

Run: `cd apps/web && pnpm exec tsc --noEmit && pnpm lint`
Expected: sem erros (as páginas `[slug]`/`novo` continuam usando `PostEditor` com as mesmas props).

```bash
git add apps/web/components/admin/posts/post-editor.tsx
git commit -m "feat(admin): editor de posts reskin (título topo + abas + toolbar + sidebar de cards)"
```

---

## Task 10: E2E + docs + verificação completa

**Files:** Modify `apps/web/app/(admin)/admin/posts/editor.e2e.ts`, `CLAUDE.md`.

- [ ] **Step 1: Atualiza o mock + adiciona testes das abas/toolbar/save no `editor.e2e.ts`**

No `editor.e2e.ts`, adicione `readingTimeMinutes: 0` ao objeto `frontmatter` do mock `post` (pra casar com o schema novo). Depois adicione, dentro do arquivo, um novo teste após o existente:

```ts
test('alterna abas e a toolbar insere markdown', async ({ page }) => {
  await baseMocks(page)
  await page.route('**/api/admin/posts/wsl-pt1', (r) =>
    r.fulfill({ contentType: 'application/json', body: envelope(post) }),
  )
  await page.goto('/admin/posts/wsl-pt1')

  // título no topo
  await expect(page.getByLabel('Título')).toHaveValue('WSL Pt.1')

  // abas
  await expect(page.getByRole('button', { name: 'Editar' })).toBeVisible()
  await page.getByRole('button', { name: 'Pré-visualizar' }).click()
  await page.getByRole('button', { name: 'Dividir' }).click()
  await page.getByRole('button', { name: 'Editar' }).click()

  // cards da sidebar
  await expect(page.getByText('Publicação')).toBeVisible()
  await expect(page.getByText('Metadados')).toBeVisible()
  await expect(page.getByText('Imagem de capa')).toBeVisible()
  await expect(
    page.getByRole('button', { name: /salvar altera/i }),
  ).toBeVisible()
})
```

E ajuste o teste existente "saves an edited title" pra clicar no botão **"Salvar alterações"** (no card) em vez do antigo "Salvar" (se ele referenciava o botão do topo). Leia o teste atual e atualize o seletor para `page.getByRole('button', { name: /salvar altera/i })`.

- [ ] **Step 2: Roda o E2E**

Run: `cd apps/web && pnpm test:e2e editor.e2e.ts`
Expected: todos passam. (Se o dev server não subir no ambiente, reporte; senão garanta tsc/lint verdes.)

- [ ] **Step 3: Atualiza o CLAUDE.md**

Na seção **Blog (posts)** / Slice ③, ajuste a descrição do editor para refletir o reskin. Troque a frase do editor por:

```markdown
- **Editor (DS V2 reskin):** `/admin/posts/{novo,[slug]}` — título grande no topo, área de conteúdo com abas **Editar / Dividir / Pré-visualizar** (`editor-tabs.tsx`) + toolbar de markdown (`mdx-toolbar.tsx`, age no `EditorView` do CodeMirror via `mdx-toolbar-actions.ts` puro), e sidebar em cards (`sidebar-card.tsx`): **Publicação** (`post-publish-card.tsx`: toggle Publicado=`!draft`, Data, Leitura `readingTimeMinutes`, Salvar), **Metadados** (`post-meta-card.tsx`), **Tags** (`TagArrayInput`), **Imagem de capa** (`cover-image-card.tsx`: dropzone que faz upload via a rota de mídia + Biblioteca + path manual). `readingTimeMinutes` é editável e auto-sugerido (`reading-time.ts` `estimateReadingTime`) quando vazio. O `post-frontmatter-form` foi removido (substituído pelos cards). O IO/preview MDX e o render público seguem intactos.
```

- [ ] **Step 4: Verificação completa (output real)**

```bash
cd apps/web
pnpm prettier:check          # formata só os arquivos novos se acusar
pnpm lint                    # clean
pnpm exec tsc --noEmit
pnpm test                    # Jest verde (incl. reading-time + mdx-toolbar-actions)
pnpm test:e2e editor.e2e.ts
pnpm build:ci                # compila
```

Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(admin)/admin/posts/editor.e2e.ts" CLAUDE.md
git commit -m "test(admin): E2E do editor reskin + docs CLAUDE.md"
```

---

## Self-review (plano × spec)

**Cobertura da spec:**

- §3.1 layout (título topo, 2 colunas, abas) → Task 9. ✅
- §3.2 toolbar (ações puras + ponte EditorView) → Tasks 2 + 5. ✅
- §3.3 mdx-editor (sem nº linha + onReady) → Task 3. ✅
- §3.4 cards (publish/meta/tags) → Tasks 6 + 7 + 9 (tags inline). ✅
- §3.5 dropzone de capa → Task 8. ✅
- §3.6 schema + reading-time → Task 1. ✅
- §3.7 editor-tabs → Task 4. ✅
- §5 testes: Jest (reading-time, mdx-toolbar-actions) Tasks 1/2; stories em cada componente novo Tasks 4–8; E2E Task 10. ✅
- §7 aceite 1–8 → Tasks 1–10 (incl. #6 stories em todo componente novo, #8 CLAUDE.md). ✅

**Placeholders:** nenhum TBD; código completo em cada passo; libs com testes red→green; comandos com expected.

**Consistência de tipos/nomes:** `EditResult {text,selFrom,selTo}` (Task 2) usado em `mdx-toolbar` (Task 5). `EditorTab` (Task 4) usado no `post-editor` (Task 9). `PostFrontmatter` agora com `readingTimeMinutes` (Task 1) usado em publish-card/meta-card/post-editor. `SidebarCard` (Task 6) usado em 7/8/9. `MdxEditor.onReady(view: EditorView)` (Task 3) ↔ `editorRef` no post-editor + `MdxToolbar` (Tasks 5/9). Props do `PostEditor` inalteradas → páginas `[slug]`/`novo` seguem (só `EMPTY_FM` ganha o campo, Task 1).
