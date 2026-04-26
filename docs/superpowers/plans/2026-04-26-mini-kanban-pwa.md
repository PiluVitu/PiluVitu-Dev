# Mini Kanban PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar um mini Kanban board PWA estilo Trello em `/tasks`, com drag and drop, localStorage, tags, links, export/import JSON e instalação como app.

**Architecture:** Rota `/tasks` dentro do layout do site existente (`app/(site)/`). Estado gerenciado por `useKanbanStore` (`useReducer` + `localStorage`). Drag and drop via `@dnd-kit/core` + `@dnd-kit/sortable`. PWA via `public/manifest.json` + service worker manual registrado via `useEffect` no `KanbanBoard`.

**Tech Stack:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (novos); `nanoid`, `zod`, shadcn/ui (`Dialog`, `Button`, `Input`, `Textarea`, `Badge`, `Card`, `Separator`), `@radix-ui/react-icons`, `sonner` (todos já no projeto).

---

## File Map

**Create:**
| Arquivo | Responsabilidade |
|---|---|
| `lib/kanban-schema.ts` | Tipos TypeScript + schemas Zod + constante `TAG_COLORS` + `INITIAL_STATE` |
| `hooks/use-kanban-store.ts` | `useReducer` com todos os actions + persistência em `localStorage` |
| `lib/kanban-export.ts` | `exportState()` (download JSON) + `parseImport()` (parse + validação Zod) |
| `public/manifest.json` | PWA manifest (nome, ícones, display: standalone) |
| `public/sw.js` | Service worker cache-first para `/tasks` |
| `public/icons/icon.svg` | Ícone PWA SVG (Kanban visual simples) |
| `components/kanban/tag-badge.tsx` | Badge colorido com cor via `style` inline |
| `components/kanban/add-card-button.tsx` | Botão "+ Adicionar card" reutilizável |
| `components/kanban/column-header.tsx` | Header de coluna: título editável inline + botão deletar |
| `components/kanban/kanban-card.tsx` | Card arrastável (`useSortable`), clicável para modal |
| `components/kanban/card-modal.tsx` | Dialog para criar/editar card (título, descrição, links, tags) |
| `components/kanban/tag-manager-dialog.tsx` | Dialog CRUD de tags globais com paleta de cores |
| `components/kanban/board-header.tsx` | Header do board: Export, Import, Tags |
| `components/kanban/kanban-column.tsx` | Coluna arrastável + droppable, gerencia modal local |
| `components/kanban/kanban-board.tsx` | `DndContext` raiz + `DragOverlay` + "Nova coluna" |
| `app/(site)/tasks/page.tsx` | Server Component: metadata PWA + render `KanbanBoard` |
| `stories/TagBadge.stories.tsx` | Storybook: cores variadas |
| `stories/KanbanCard.stories.tsx` | Storybook: simples, com tags, com links, título longo |
| `stories/CardModal.stories.tsx` | Storybook: modo criação, modo edição, sem tags |
| `stories/TagManagerDialog.stories.tsx` | Storybook: sem tags, com tags |
| `stories/KanbanColumn.stories.tsx` | Storybook: vazia, com cards |
| `e2e/kanban.spec.ts` | Playwright E2E: todos os fluxos críticos |

**Modify:**
| Arquivo | Mudança |
|---|---|
| `CLAUDE.md` | Documentar rota `/tasks`, @dnd-kit, Playwright kanban |

---

## Task 1: Instalar dependências @dnd-kit

**Files:**
- Modify: `package.json` (automático via pnpm)

- [ ] **Step 1: Instalar os três pacotes**

```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Saída esperada: `+ @dnd-kit/core X.X.X`, `+ @dnd-kit/sortable X.X.X`, `+ @dnd-kit/utilities X.X.X`

- [ ] **Step 2: Verificar que não houve conflito de peer dependencies**

```bash
pnpm exec tsc --noEmit 2>&1 | head -20
```

Saída esperada: sem output (0 erros).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @dnd-kit packages for kanban drag and drop"
```

---

## Task 2: Tipos, schema Zod e constantes

**Files:**
- Create: `lib/kanban-schema.ts`

- [ ] **Step 1: Criar `lib/kanban-schema.ts`**

```typescript
import { z } from 'zod'

export type Tag = {
  id: string
  label: string
  color: string
}

export type CardLink = {
  url: string
  label?: string
}

export type Card = {
  id: string
  title: string
  description?: string
  links: CardLink[]
  tagIds: string[]
  createdAt: string
}

export type Column = {
  id: string
  title: string
  cardIds: string[]
}

export type KanbanState = {
  columnOrder: string[]
  columns: Record<string, Column>
  cards: Record<string, Card>
  tags: Record<string, Tag>
}

const CardLinkSchema = z.object({
  url: z.string(),
  label: z.string().optional(),
})

const CardSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  links: z.array(CardLinkSchema),
  tagIds: z.array(z.string()),
  createdAt: z.string(),
})

const ColumnSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  cardIds: z.array(z.string()),
})

const TagSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  color: z.string(),
})

export const KanbanStateSchema = z.object({
  columnOrder: z.array(z.string()),
  columns: z.record(z.string(), ColumnSchema),
  cards: z.record(z.string(), CardSchema),
  tags: z.record(z.string(), TagSchema),
})

export const INITIAL_STATE: KanbanState = {
  columnOrder: [],
  columns: {},
  cards: {},
  tags: {},
}

export const TAG_COLORS: string[] = [
  'hsl(220 70% 50%)',
  'hsl(142 70% 45%)',
  'hsl(38 92% 50%)',
  'hsl(0 72% 51%)',
  'hsl(270 70% 60%)',
  'hsl(186 64% 49%)',
  'hsl(24 75% 55%)',
  'hsl(330 65% 55%)',
  'hsl(160 60% 45%)',
  'hsl(55 80% 50%)',
]
```

- [ ] **Step 2: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 3: Commit**

```bash
git add lib/kanban-schema.ts
git commit -m "feat(kanban): add types, zod schema and tag color constants"
```

---

## Task 3: Hook useKanbanStore (reducer + localStorage)

**Files:**
- Create: `hooks/use-kanban-store.ts`

- [ ] **Step 1: Criar `hooks/use-kanban-store.ts`**

```typescript
'use client'

import { useReducer, useEffect } from 'react'
import { nanoid } from 'nanoid'
import {
  KanbanState,
  INITIAL_STATE,
  KanbanStateSchema,
  Card,
  CardLink,
  Tag,
} from '@/lib/kanban-schema'

export type Action =
  | { type: 'ADD_COLUMN'; title: string }
  | { type: 'UPDATE_COLUMN_TITLE'; columnId: string; title: string }
  | { type: 'DELETE_COLUMN'; columnId: string }
  | { type: 'REORDER_COLUMNS'; columnOrder: string[] }
  | {
      type: 'ADD_CARD'
      columnId: string
      title: string
      description?: string
      links: CardLink[]
      tagIds: string[]
    }
  | { type: 'UPDATE_CARD'; card: Card }
  | { type: 'DELETE_CARD'; cardId: string; columnId: string }
  | {
      type: 'MOVE_CARD'
      cardId: string
      fromColumnId: string
      toColumnId: string
      toIndex: number
    }
  | { type: 'ADD_TAG'; label: string; color: string }
  | { type: 'UPDATE_TAG'; tag: Tag }
  | { type: 'DELETE_TAG'; tagId: string }
  | { type: 'IMPORT_STATE'; state: KanbanState }
  | { type: 'RESET_STATE' }

const STORAGE_KEY = 'kanban-state'

function reducer(state: KanbanState, action: Action): KanbanState {
  switch (action.type) {
    case 'ADD_COLUMN': {
      const id = nanoid()
      return {
        ...state,
        columnOrder: [...state.columnOrder, id],
        columns: {
          ...state.columns,
          [id]: { id, title: action.title, cardIds: [] },
        },
      }
    }

    case 'UPDATE_COLUMN_TITLE': {
      return {
        ...state,
        columns: {
          ...state.columns,
          [action.columnId]: {
            ...state.columns[action.columnId],
            title: action.title,
          },
        },
      }
    }

    case 'DELETE_COLUMN': {
      const column = state.columns[action.columnId]
      const newCards = { ...state.cards }
      column.cardIds.forEach((id) => delete newCards[id])
      const newColumns = { ...state.columns }
      delete newColumns[action.columnId]
      return {
        ...state,
        columnOrder: state.columnOrder.filter((id) => id !== action.columnId),
        columns: newColumns,
        cards: newCards,
      }
    }

    case 'REORDER_COLUMNS': {
      return { ...state, columnOrder: action.columnOrder }
    }

    case 'ADD_CARD': {
      const id = nanoid()
      const card: Card = {
        id,
        title: action.title,
        description: action.description,
        links: action.links,
        tagIds: action.tagIds,
        createdAt: new Date().toISOString(),
      }
      return {
        ...state,
        cards: { ...state.cards, [id]: card },
        columns: {
          ...state.columns,
          [action.columnId]: {
            ...state.columns[action.columnId],
            cardIds: [...state.columns[action.columnId].cardIds, id],
          },
        },
      }
    }

    case 'UPDATE_CARD': {
      return {
        ...state,
        cards: { ...state.cards, [action.card.id]: action.card },
      }
    }

    case 'DELETE_CARD': {
      const newCards = { ...state.cards }
      delete newCards[action.cardId]
      return {
        ...state,
        cards: newCards,
        columns: {
          ...state.columns,
          [action.columnId]: {
            ...state.columns[action.columnId],
            cardIds: state.columns[action.columnId].cardIds.filter(
              (id) => id !== action.cardId,
            ),
          },
        },
      }
    }

    case 'MOVE_CARD': {
      const { cardId, fromColumnId, toColumnId, toIndex } = action
      const fromCardIds = state.columns[fromColumnId].cardIds.filter(
        (id) => id !== cardId,
      )

      if (fromColumnId === toColumnId) {
        const newCardIds = [...fromCardIds]
        newCardIds.splice(toIndex, 0, cardId)
        return {
          ...state,
          columns: {
            ...state.columns,
            [fromColumnId]: {
              ...state.columns[fromColumnId],
              cardIds: newCardIds,
            },
          },
        }
      }

      const toCardIds = [...state.columns[toColumnId].cardIds]
      toCardIds.splice(toIndex, 0, cardId)
      return {
        ...state,
        columns: {
          ...state.columns,
          [fromColumnId]: {
            ...state.columns[fromColumnId],
            cardIds: fromCardIds,
          },
          [toColumnId]: {
            ...state.columns[toColumnId],
            cardIds: toCardIds,
          },
        },
      }
    }

    case 'ADD_TAG': {
      const id = nanoid()
      return {
        ...state,
        tags: {
          ...state.tags,
          [id]: { id, label: action.label, color: action.color },
        },
      }
    }

    case 'UPDATE_TAG': {
      return {
        ...state,
        tags: { ...state.tags, [action.tag.id]: action.tag },
      }
    }

    case 'DELETE_TAG': {
      const newTags = { ...state.tags }
      delete newTags[action.tagId]
      const newCards = Object.fromEntries(
        Object.entries(state.cards).map(([id, card]) => [
          id,
          {
            ...card,
            tagIds: card.tagIds.filter((tid) => tid !== action.tagId),
          },
        ]),
      )
      return { ...state, tags: newTags, cards: newCards }
    }

    case 'IMPORT_STATE': {
      return action.state
    }

    case 'RESET_STATE': {
      return INITIAL_STATE
    }

    default:
      return state
  }
}

function loadState(): KanbanState {
  if (typeof window === 'undefined') return INITIAL_STATE
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return INITIAL_STATE
    const result = KanbanStateSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : INITIAL_STATE
  } catch {
    return INITIAL_STATE
  }
}

export function useKanbanStore() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  return { state, dispatch }
}
```

- [ ] **Step 2: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 3: Commit**

```bash
git add hooks/use-kanban-store.ts
git commit -m "feat(kanban): add useKanbanStore with reducer and localStorage persistence"
```

---

## Task 4: Helpers de export/import

**Files:**
- Create: `lib/kanban-export.ts`

- [ ] **Step 1: Criar `lib/kanban-export.ts`**

```typescript
import { KanbanState, KanbanStateSchema } from '@/lib/kanban-schema'

export function exportState(state: KanbanState): void {
  const json = JSON.stringify(state, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const date = new Date().toISOString().slice(0, 10)
  const a = document.createElement('a')
  a.href = url
  a.download = `kanban-backup-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export type ImportResult =
  | { success: true; state: KanbanState }
  | { success: false; error: string }

export function parseImport(text: string): ImportResult {
  try {
    const parsed = JSON.parse(text)
    const result = KanbanStateSchema.safeParse(parsed)
    if (result.success) return { success: true, state: result.data }
    return {
      success: false,
      error: result.error.issues[0]?.message ?? 'Arquivo inválido',
    }
  } catch {
    return { success: false, error: 'JSON malformado' }
  }
}
```

- [ ] **Step 2: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 3: Commit**

```bash
git add lib/kanban-export.ts
git commit -m "feat(kanban): add export/import helpers with zod validation"
```

---

## Task 5: Arquivos PWA (manifest, service worker, ícone)

**Files:**
- Create: `public/manifest.json`
- Create: `public/sw.js`
- Create: `public/icons/icon.svg`

- [ ] **Step 1: Criar diretório de ícones**

```bash
mkdir -p public/icons
```

- [ ] **Step 2: Criar `public/icons/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="16" fill="#020817"/>
  <rect x="14" y="22" width="18" height="56" rx="4" fill="#3b82f6"/>
  <rect x="41" y="22" width="18" height="40" rx="4" fill="#8b5cf6"/>
  <rect x="68" y="22" width="18" height="64" rx="4" fill="#10b981"/>
</svg>
```

- [ ] **Step 3: Criar `public/manifest.json`**

```json
{
  "name": "Mini Kanban",
  "short_name": "Kanban",
  "description": "Mini Kanban board pessoal com localStorage",
  "start_url": "/tasks",
  "display": "standalone",
  "background_color": "#020817",
  "theme_color": "#020817",
  "icons": [
    {
      "src": "/icons/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Step 4: Criar `public/sw.js`**

```javascript
const CACHE_NAME = 'kanban-v1'
const PRECACHE = ['/tasks', '/manifest.json', '/icons/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  event.respondWith(
    caches
      .match(event.request)
      .then((cached) => cached ?? fetch(event.request)),
  )
})
```

- [ ] **Step 5: Commit**

```bash
git add public/manifest.json public/sw.js public/icons/icon.svg
git commit -m "feat(kanban): add PWA manifest, service worker and icon"
```

---

## Task 6: TagBadge + Storybook story

**Files:**
- Create: `components/kanban/tag-badge.tsx`
- Create: `stories/TagBadge.stories.tsx`

- [ ] **Step 1: Criar `components/kanban/tag-badge.tsx`**

```typescript
import { Badge } from '@/components/ui/badge'
import { Tag } from '@/lib/kanban-schema'
import { cn } from '@/lib/utils'

interface TagBadgeProps {
  tag: Tag
  className?: string
}

export function TagBadge({ tag, className }: TagBadgeProps) {
  return (
    <Badge
      className={cn('border-0 text-white', className)}
      style={{ backgroundColor: tag.color }}
    >
      {tag.label}
    </Badge>
  )
}
```

- [ ] **Step 2: Criar `stories/TagBadge.stories.tsx`**

```typescript
import type { Meta, StoryObj } from '@storybook/nextjs'
import { TagBadge } from '@/components/kanban/tag-badge'
import { TAG_COLORS } from '@/lib/kanban-schema'

const meta = {
  title: 'Kanban/TagBadge',
  component: TagBadge,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof TagBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Azul: Story = {
  args: { tag: { id: '1', label: 'Frontend', color: TAG_COLORS[0] } },
}

export const Verde: Story = {
  args: { tag: { id: '2', label: 'Backend', color: TAG_COLORS[1] } },
}

export const Vermelho: Story = {
  args: { tag: { id: '3', label: 'Bug', color: TAG_COLORS[3] } },
}

export const TodasAsCores: Story = {
  name: 'Todas as cores',
  render: () => (
    <div className="flex flex-wrap gap-2">
      {TAG_COLORS.map((color, i) => (
        <TagBadge key={color} tag={{ id: String(i), label: `Tag ${i + 1}`, color }} />
      ))}
    </div>
  ),
}
```

- [ ] **Step 3: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 4: Commit**

```bash
git add components/kanban/tag-badge.tsx stories/TagBadge.stories.tsx
git commit -m "feat(kanban): add TagBadge component and Storybook story"
```

---

## Task 7: KanbanCard + Storybook story

**Files:**
- Create: `components/kanban/kanban-card.tsx`
- Create: `stories/KanbanCard.stories.tsx`

- [ ] **Step 1: Criar `components/kanban/kanban-card.tsx`**

```typescript
'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent } from '@/components/ui/card'
import { TagBadge } from './tag-badge'
import { Card as CardType, Tag } from '@/lib/kanban-schema'
import { Link2Icon } from '@radix-ui/react-icons'
import { cn } from '@/lib/utils'

interface KanbanCardProps {
  card: CardType
  columnId: string
  tags: Record<string, Tag>
  onClick: () => void
  isDragOverlay?: boolean
}

export function KanbanCard({
  card,
  columnId,
  tags,
  onClick,
  isDragOverlay = false,
}: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: { type: 'card', columnId },
  })

  const style = isDragOverlay
    ? undefined
    : { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={style}
      {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
    >
      <Card
        className={cn(
          'cursor-grab select-none',
          isDragging && 'opacity-40',
          isDragOverlay && 'rotate-2 cursor-grabbing shadow-lg',
        )}
        onClick={isDragOverlay ? undefined : onClick}
      >
        <CardContent className="space-y-2 p-3">
          <p className="line-clamp-3 text-sm font-medium">{card.title}</p>
          {card.links.length > 0 && (
            <div
              className="flex items-center gap-1 text-muted-foreground"
              data-testid="card-link-indicator"
            >
              <Link2Icon className="h-3 w-3" />
              <span className="text-xs">{card.links.length}</span>
            </div>
          )}
          {card.tagIds.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {card.tagIds.map(
                (tid) => tags[tid] && <TagBadge key={tid} tag={tags[tid]} />,
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Criar `stories/KanbanCard.stories.tsx`**

```typescript
import type { Meta, StoryObj } from '@storybook/nextjs'
import { KanbanCard } from '@/components/kanban/kanban-card'
import { DndContext } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { TAG_COLORS } from '@/lib/kanban-schema'

const mockTags = {
  t1: { id: 't1', label: 'Frontend', color: TAG_COLORS[0] },
  t2: { id: 't2', label: 'Bug', color: TAG_COLORS[3] },
}

const baseCard = {
  id: 'c1',
  title: 'Implementar autenticação OAuth',
  description: 'Usar GitHub OAuth2',
  links: [],
  tagIds: [],
  createdAt: new Date().toISOString(),
}

const meta = {
  title: 'Kanban/KanbanCard',
  component: KanbanCard,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story: React.ComponentType) => (
      <DndContext>
        <SortableContext items={['c1']}>
          <div className="w-72">
            <Story />
          </div>
        </SortableContext>
      </DndContext>
    ),
  ],
} satisfies Meta<typeof KanbanCard>

export default meta
type Story = StoryObj<typeof meta>

export const Simples: Story = {
  args: { card: baseCard, columnId: 'col1', tags: {}, onClick: () => {} },
}

export const ComTags: Story = {
  args: {
    card: { ...baseCard, tagIds: ['t1', 't2'] },
    columnId: 'col1',
    tags: mockTags,
    onClick: () => {},
  },
}

export const ComLinks: Story = {
  args: {
    card: {
      ...baseCard,
      links: [
        { url: 'https://docs.github.com', label: 'Docs' },
        { url: 'https://example.com' },
      ],
    },
    columnId: 'col1',
    tags: {},
    onClick: () => {},
  },
}

export const Completo: Story = {
  args: {
    card: {
      ...baseCard,
      links: [{ url: 'https://docs.github.com', label: 'Docs' }],
      tagIds: ['t1', 't2'],
    },
    columnId: 'col1',
    tags: mockTags,
    onClick: () => {},
  },
}

export const TituloLongo: Story = {
  args: {
    card: {
      ...baseCard,
      title:
        'Implementar sistema de autenticação completo com múltiplos provedores OAuth2 e suporte a 2FA via TOTP',
    },
    columnId: 'col1',
    tags: {},
    onClick: () => {},
  },
}
```

- [ ] **Step 3: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 4: Commit**

```bash
git add components/kanban/kanban-card.tsx stories/KanbanCard.stories.tsx
git commit -m "feat(kanban): add KanbanCard component and Storybook stories"
```

---

## Task 8: CardModal + Storybook story

**Files:**
- Create: `components/kanban/card-modal.tsx`
- Create: `stories/CardModal.stories.tsx`

- [ ] **Step 1: Criar `components/kanban/card-modal.tsx`**

```typescript
'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { TagBadge } from './tag-badge'
import { Card, CardLink, Tag } from '@/lib/kanban-schema'
import { Cross2Icon, PlusIcon, TrashIcon } from '@radix-ui/react-icons'

export type CardFormData = {
  title: string
  description: string
  links: CardLink[]
  tagIds: string[]
}

type CardModalProps =
  | {
      mode: 'create'
      tags: Record<string, Tag>
      onSave: (data: CardFormData) => void
      onClose: () => void
      card?: never
      onDelete?: never
    }
  | {
      mode: 'edit'
      card: Card
      tags: Record<string, Tag>
      onSave: (data: CardFormData) => void
      onDelete: (cardId: string) => void
      onClose: () => void
    }

export function CardModal({
  mode,
  card,
  tags,
  onSave,
  onDelete,
  onClose,
}: CardModalProps) {
  const [title, setTitle] = useState(mode === 'edit' ? card.title : '')
  const [description, setDescription] = useState(
    mode === 'edit' ? (card.description ?? '') : '',
  )
  const [links, setLinks] = useState<CardLink[]>(
    mode === 'edit' ? card.links : [],
  )
  const [tagIds, setTagIds] = useState<string[]>(
    mode === 'edit' ? card.tagIds : [],
  )
  const [confirmDelete, setConfirmDelete] = useState(false)

  const tagList = Object.values(tags)

  function handleSave() {
    if (!title.trim()) return
    onSave({ title: title.trim(), description: description.trim(), links, tagIds })
  }

  function addLink() {
    setLinks((prev) => [...prev, { url: '', label: '' }])
  }

  function updateLink(
    index: number,
    field: 'url' | 'label',
    value: string,
  ) {
    setLinks((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)),
    )
  }

  function removeLink(index: number) {
    setLinks((prev) => prev.filter((_, i) => i !== index))
  }

  function toggleTag(tagId: string) {
    setTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Novo card' : 'Editar card'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="card-title">Título *</Label>
            <Input
              id="card-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="Título do card"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="card-desc">Descrição</Label>
            <Textarea
              id="card-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição opcional"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Links</Label>
            {links.map((link, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="flex-1 space-y-1">
                  <Input
                    value={link.url}
                    onChange={(e) => updateLink(i, 'url', e.target.value)}
                    placeholder="URL (https://...)"
                  />
                  <Input
                    value={link.label ?? ''}
                    onChange={(e) => updateLink(i, 'label', e.target.value)}
                    placeholder="Texto de exibição (opcional)"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeLink(i)}
                >
                  <Cross2Icon className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={addLink}
              className="w-full"
            >
              <PlusIcon className="mr-2 h-4 w-4" />
              Adicionar link
            </Button>
          </div>

          {tagList.length > 0 && (
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2">
                {tagList.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={`rounded-full transition-opacity ${
                      tagIds.includes(tag.id)
                        ? 'opacity-100 ring-2 ring-ring ring-offset-2'
                        : 'opacity-40'
                    }`}
                  >
                    <TagBadge tag={tag} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {mode === 'edit' && (
            <>
              {confirmDelete ? (
                <div className="mr-auto flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onDelete(card.id)}
                  >
                    Confirmar exclusão
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mr-auto text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <TrashIcon className="mr-2 h-3.5 w-3.5" />
                  Excluir
                </Button>
              )}
            </>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!title.trim()}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Criar `stories/CardModal.stories.tsx`**

```typescript
import type { Meta, StoryObj } from '@storybook/nextjs'
import { CardModal } from '@/components/kanban/card-modal'
import { TAG_COLORS } from '@/lib/kanban-schema'
import { fn } from '@storybook/test'

const mockTags = {
  t1: { id: 't1', label: 'Frontend', color: TAG_COLORS[0] },
  t2: { id: 't2', label: 'Backend', color: TAG_COLORS[1] },
  t3: { id: 't3', label: 'Bug', color: TAG_COLORS[3] },
}

const meta = {
  title: 'Kanban/CardModal',
  component: CardModal,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof CardModal>

export default meta
type Story = StoryObj<typeof meta>

export const Criacao: Story = {
  args: {
    mode: 'create',
    tags: mockTags,
    onSave: fn(),
    onClose: fn(),
  },
}

export const Edicao: Story = {
  args: {
    mode: 'edit',
    card: {
      id: 'c1',
      title: 'Implementar OAuth',
      description: 'Usar GitHub OAuth2 com PKCE',
      links: [{ url: 'https://docs.github.com/en/apps/oauth-apps', label: 'Docs GitHub' }],
      tagIds: ['t1', 't3'],
      createdAt: new Date().toISOString(),
    },
    tags: mockTags,
    onSave: fn(),
    onDelete: fn(),
    onClose: fn(),
  },
}

export const SemTags: Story = {
  args: {
    mode: 'create',
    tags: {},
    onSave: fn(),
    onClose: fn(),
  },
}
```

- [ ] **Step 3: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 4: Commit**

```bash
git add components/kanban/card-modal.tsx stories/CardModal.stories.tsx
git commit -m "feat(kanban): add CardModal component and Storybook stories"
```

---

## Task 9: TagManagerDialog + Storybook story

**Files:**
- Create: `components/kanban/tag-manager-dialog.tsx`
- Create: `stories/TagManagerDialog.stories.tsx`

- [ ] **Step 1: Criar `components/kanban/tag-manager-dialog.tsx`**

```typescript
'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { TagBadge } from './tag-badge'
import { Tag, TAG_COLORS } from '@/lib/kanban-schema'
import { TrashIcon } from '@radix-ui/react-icons'

interface TagManagerDialogProps {
  tags: Record<string, Tag>
  onAddTag: (label: string, color: string) => void
  onDeleteTag: (tagId: string) => void
  onClose: () => void
}

export function TagManagerDialog({
  tags,
  onAddTag,
  onDeleteTag,
  onClose,
}: TagManagerDialogProps) {
  const [label, setLabel] = useState('')
  const [selectedColor, setSelectedColor] = useState(TAG_COLORS[0])

  const tagList = Object.values(tags)

  function handleAdd() {
    const trimmed = label.trim()
    if (!trimmed) return
    onAddTag(trimmed, selectedColor)
    setLabel('')
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Gerenciar tags</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {tagList.length > 0 && (
            <div className="space-y-2">
              {tagList.map((tag) => (
                <div key={tag.id} className="flex items-center justify-between">
                  <TagBadge tag={tag} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => onDeleteTag(tag.id)}
                    aria-label={`Deletar tag ${tag.label}`}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Separator />
            </div>
          )}

          <div className="space-y-3">
            <Label>Nova tag</Label>
            <Input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Nome da tag"
            />
            <div className="flex flex-wrap gap-2">
              {TAG_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`h-6 w-6 rounded-full transition-transform ${
                    selectedColor === color
                      ? 'scale-125 ring-2 ring-ring ring-offset-1'
                      : ''
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={`Cor ${color}`}
                />
              ))}
            </div>
            {label.trim() && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">Preview:</span>
                <TagBadge
                  tag={{ id: 'preview', label: label.trim(), color: selectedColor }}
                />
              </div>
            )}
            <Button
              onClick={handleAdd}
              disabled={!label.trim()}
              className="w-full"
            >
              Criar tag
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Criar `stories/TagManagerDialog.stories.tsx`**

```typescript
import type { Meta, StoryObj } from '@storybook/nextjs'
import { TagManagerDialog } from '@/components/kanban/tag-manager-dialog'
import { TAG_COLORS } from '@/lib/kanban-schema'
import { fn } from '@storybook/test'

const mockTags = {
  t1: { id: 't1', label: 'Frontend', color: TAG_COLORS[0] },
  t2: { id: 't2', label: 'Backend', color: TAG_COLORS[1] },
  t3: { id: 't3', label: 'Bug', color: TAG_COLORS[3] },
}

const meta = {
  title: 'Kanban/TagManagerDialog',
  component: TagManagerDialog,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof TagManagerDialog>

export default meta
type Story = StoryObj<typeof meta>

export const SemTags: Story = {
  args: {
    tags: {},
    onAddTag: fn(),
    onDeleteTag: fn(),
    onClose: fn(),
  },
}

export const ComTags: Story = {
  args: {
    tags: mockTags,
    onAddTag: fn(),
    onDeleteTag: fn(),
    onClose: fn(),
  },
}
```

- [ ] **Step 3: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 4: Commit**

```bash
git add components/kanban/tag-manager-dialog.tsx stories/TagManagerDialog.stories.tsx
git commit -m "feat(kanban): add TagManagerDialog component and Storybook stories"
```

---

## Task 10: BoardHeader

**Files:**
- Create: `components/kanban/board-header.tsx`

- [ ] **Step 1: Criar `components/kanban/board-header.tsx`**

```typescript
'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { TagManagerDialog } from './tag-manager-dialog'
import { KanbanState } from '@/lib/kanban-schema'
import { exportState, parseImport } from '@/lib/kanban-export'
import { toast } from 'sonner'
import { Action } from '@/hooks/use-kanban-store'
import { DownloadIcon, GearIcon, UploadIcon } from '@radix-ui/react-icons'

interface BoardHeaderProps {
  state: KanbanState
  dispatch: React.Dispatch<Action>
}

export function BoardHeader({ state, dispatch }: BoardHeaderProps) {
  const [showTagManager, setShowTagManager] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = parseImport(ev.target?.result as string)
      if (result.success) {
        dispatch({ type: 'IMPORT_STATE', state: result.state })
        toast.success('Board importado com sucesso')
      } else {
        toast.error(`Erro ao importar: ${result.error}`)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="mb-6 flex items-center justify-between">
      <h1 className="text-2xl font-bold">Mini Kanban</h1>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportState(state)}
        >
          <DownloadIcon className="mr-2 h-4 w-4" />
          Exportar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => importRef.current?.click()}
        >
          <UploadIcon className="mr-2 h-4 w-4" />
          Importar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowTagManager(true)}
        >
          <GearIcon className="mr-2 h-4 w-4" />
          Tags
        </Button>
        <input
          ref={importRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImport}
        />
      </div>

      {showTagManager && (
        <TagManagerDialog
          tags={state.tags}
          onAddTag={(label, color) => dispatch({ type: 'ADD_TAG', label, color })}
          onDeleteTag={(tagId) => dispatch({ type: 'DELETE_TAG', tagId })}
          onClose={() => setShowTagManager(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 3: Commit**

```bash
git add components/kanban/board-header.tsx
git commit -m "feat(kanban): add BoardHeader with export, import and tag manager"
```

---

## Task 11: ColumnHeader + AddCardButton

**Files:**
- Create: `components/kanban/column-header.tsx`
- Create: `components/kanban/add-card-button.tsx`

- [ ] **Step 1: Criar `components/kanban/column-header.tsx`**

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TrashIcon } from '@radix-ui/react-icons'

interface ColumnHeaderProps {
  title: string
  onTitleChange: (title: string) => void
  onDelete: () => void
}

export function ColumnHeader({
  title,
  onTitleChange,
  onDelete,
}: ColumnHeaderProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function commit() {
    const trimmed = value.trim()
    if (trimmed && trimmed !== title) onTitleChange(trimmed)
    else setValue(title)
    setEditing(false)
  }

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2">
      {editing ? (
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setValue(title)
              setEditing(false)
            }
          }}
          className="h-7 text-sm font-semibold"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="flex-1 truncate text-left text-sm font-semibold transition-opacity hover:opacity-70"
        >
          {title}
        </button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
        aria-label={`Deletar coluna ${title}`}
      >
        <TrashIcon className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Criar `components/kanban/add-card-button.tsx`**

```typescript
'use client'

import { Button } from '@/components/ui/button'
import { PlusIcon } from '@radix-ui/react-icons'

interface AddCardButtonProps {
  onClick: () => void
}

export function AddCardButton({ onClick }: AddCardButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start text-muted-foreground hover:text-foreground"
      onClick={onClick}
    >
      <PlusIcon className="mr-2 h-4 w-4" />
      Adicionar card
    </Button>
  )
}
```

- [ ] **Step 3: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 4: Commit**

```bash
git add components/kanban/column-header.tsx components/kanban/add-card-button.tsx
git commit -m "feat(kanban): add ColumnHeader and AddCardButton components"
```

---

## Task 12: KanbanColumn + Storybook story

**Files:**
- Create: `components/kanban/kanban-column.tsx`
- Create: `stories/KanbanColumn.stories.tsx`

- [ ] **Step 1: Criar `components/kanban/kanban-column.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Column, Card as CardType, Tag } from '@/lib/kanban-schema'
import { CardFormData } from './card-modal'
import { KanbanCard } from './kanban-card'
import { ColumnHeader } from './column-header'
import { AddCardButton } from './add-card-button'
import { CardModal } from './card-modal'
import { cn } from '@/lib/utils'

interface KanbanColumnProps {
  column: Column
  cards: CardType[]
  tags: Record<string, Tag>
  onTitleChange: (title: string) => void
  onDelete: () => void
  onAddCard: (data: CardFormData) => void
  onUpdateCard: (card: CardType) => void
  onDeleteCard: (cardId: string) => void
}

export function KanbanColumn({
  column,
  cards,
  tags,
  onTitleChange,
  onDelete,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
}: KanbanColumnProps) {
  const [editingCard, setEditingCard] = useState<CardType | null>(null)
  const [creatingCard, setCreatingCard] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: { type: 'column' },
  })

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: column.id,
    data: { type: 'column' },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <>
      <div
        ref={setSortableRef}
        style={style}
        className={cn(
          'flex w-72 shrink-0 flex-col rounded-lg border bg-muted/50',
          isDragging && 'opacity-50',
        )}
      >
        <div {...attributes} {...listeners} className="cursor-grab">
          <ColumnHeader
            title={column.title}
            onTitleChange={onTitleChange}
            onDelete={onDelete}
          />
        </div>

        <div
          ref={setDropRef}
          className={cn(
            'flex min-h-[100px] flex-1 flex-col gap-2 p-2',
            isOver && 'rounded-b-lg bg-muted/80',
          )}
        >
          <SortableContext
            items={column.cardIds}
            strategy={verticalListSortingStrategy}
          >
            {cards.map((card) => (
              <KanbanCard
                key={card.id}
                card={card}
                columnId={column.id}
                tags={tags}
                onClick={() => setEditingCard(card)}
              />
            ))}
          </SortableContext>
        </div>

        <div className="p-2">
          <AddCardButton onClick={() => setCreatingCard(true)} />
        </div>
      </div>

      {creatingCard && (
        <CardModal
          mode="create"
          tags={tags}
          onSave={(data) => {
            onAddCard(data)
            setCreatingCard(false)
          }}
          onClose={() => setCreatingCard(false)}
        />
      )}

      {editingCard && (
        <CardModal
          mode="edit"
          card={editingCard}
          tags={tags}
          onSave={(data) => {
            onUpdateCard({ ...editingCard, ...data })
            setEditingCard(null)
          }}
          onDelete={(cardId) => {
            onDeleteCard(cardId)
            setEditingCard(null)
          }}
          onClose={() => setEditingCard(null)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Criar `stories/KanbanColumn.stories.tsx`**

```typescript
import type { Meta, StoryObj } from '@storybook/nextjs'
import { KanbanColumn } from '@/components/kanban/kanban-column'
import { DndContext } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { TAG_COLORS } from '@/lib/kanban-schema'
import { fn } from '@storybook/test'

const mockTags = {
  t1: { id: 't1', label: 'Frontend', color: TAG_COLORS[0] },
}

const mockCards = [
  {
    id: 'c1',
    title: 'Card um',
    description: '',
    links: [],
    tagIds: ['t1'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'c2',
    title: 'Card dois com título bem mais longo para testar truncamento de texto na visualização',
    description: '',
    links: [],
    tagIds: [],
    createdAt: new Date().toISOString(),
  },
]

const meta = {
  title: 'Kanban/KanbanColumn',
  component: KanbanColumn,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story: React.ComponentType) => (
      <DndContext>
        <SortableContext items={['col1']} strategy={horizontalListSortingStrategy}>
          <Story />
        </SortableContext>
      </DndContext>
    ),
  ],
} satisfies Meta<typeof KanbanColumn>

export default meta
type Story = StoryObj<typeof meta>

export const Vazia: Story = {
  args: {
    column: { id: 'col1', title: 'Backlog', cardIds: [] },
    cards: [],
    tags: {},
    onTitleChange: fn(),
    onDelete: fn(),
    onAddCard: fn(),
    onUpdateCard: fn(),
    onDeleteCard: fn(),
  },
}

export const ComCards: Story = {
  args: {
    column: { id: 'col1', title: 'Em andamento', cardIds: ['c1', 'c2'] },
    cards: mockCards,
    tags: mockTags,
    onTitleChange: fn(),
    onDelete: fn(),
    onAddCard: fn(),
    onUpdateCard: fn(),
    onDeleteCard: fn(),
  },
}
```

- [ ] **Step 3: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 4: Commit**

```bash
git add components/kanban/kanban-column.tsx stories/KanbanColumn.stories.tsx
git commit -m "feat(kanban): add KanbanColumn component and Storybook stories"
```

---

## Task 13: KanbanBoard (DnD raiz + DragOverlay)

**Files:**
- Create: `components/kanban/kanban-board.tsx`

- [ ] **Step 1: Criar `components/kanban/kanban-board.tsx`**

```typescript
'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useKanbanStore } from '@/hooks/use-kanban-store'
import { Card } from '@/lib/kanban-schema'
import { BoardHeader } from './board-header'
import { KanbanColumn } from './kanban-column'
import { KanbanCard } from './kanban-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PlusIcon } from '@radix-ui/react-icons'

export function KanbanBoard() {
  const { state, dispatch } = useKanbanStore()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColumnTitle, setNewColumnTitle] = useState('')

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
    }
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  )

  const activeCard: Card | null =
    activeId && state.cards[activeId] ? state.cards[activeId] : null

  const activeCardColumnId = useMemo(() => {
    if (!activeCard) return null
    return (
      Object.entries(state.columns).find(([, col]) =>
        col.cardIds.includes(activeCard.id),
      )?.[0] ?? null
    )
  }, [activeCard, state.columns])

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over) return

    const activeData = active.data.current as {
      type: 'column' | 'card'
      columnId?: string
    }
    const overData = over.data.current as {
      type?: 'column' | 'card'
      columnId?: string
    }

    if (activeData.type === 'column') {
      if (active.id === over.id) return
      const oldIndex = state.columnOrder.indexOf(active.id as string)
      const newIndex = state.columnOrder.indexOf(over.id as string)
      if (oldIndex !== newIndex) {
        dispatch({
          type: 'REORDER_COLUMNS',
          columnOrder: arrayMove(state.columnOrder, oldIndex, newIndex),
        })
      }
      return
    }

    if (activeData.type === 'card') {
      const fromColumnId = activeData.columnId!
      let toColumnId: string
      let toIndex: number

      if (overData?.type === 'card') {
        toColumnId = overData.columnId!
        toIndex = state.columns[toColumnId].cardIds.indexOf(over.id as string)
      } else if (overData?.type === 'column') {
        toColumnId = over.id as string
        toIndex = state.columns[toColumnId].cardIds.length
      } else {
        return
      }

      const currentIndex = state.columns[fromColumnId].cardIds.indexOf(
        active.id as string,
      )
      if (fromColumnId === toColumnId && currentIndex === toIndex) return

      dispatch({
        type: 'MOVE_CARD',
        cardId: active.id as string,
        fromColumnId,
        toColumnId,
        toIndex,
      })
    }
  }

  function handleAddColumn() {
    const title = newColumnTitle.trim()
    if (!title) return
    dispatch({ type: 'ADD_COLUMN', title })
    setNewColumnTitle('')
    setAddingColumn(false)
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <BoardHeader state={state} dispatch={dispatch} />

      <div className="flex items-start gap-4 overflow-x-auto pb-4">
        <SortableContext
          items={state.columnOrder}
          strategy={horizontalListSortingStrategy}
        >
          {state.columnOrder.map((columnId) => {
            const column = state.columns[columnId]
            if (!column) return null
            const cards = column.cardIds
              .map((id) => state.cards[id])
              .filter(Boolean)
            return (
              <KanbanColumn
                key={columnId}
                column={column}
                cards={cards}
                tags={state.tags}
                onTitleChange={(title) =>
                  dispatch({ type: 'UPDATE_COLUMN_TITLE', columnId, title })
                }
                onDelete={() =>
                  dispatch({ type: 'DELETE_COLUMN', columnId })
                }
                onAddCard={(data) =>
                  dispatch({ type: 'ADD_CARD', columnId, ...data })
                }
                onUpdateCard={(card) =>
                  dispatch({ type: 'UPDATE_CARD', card })
                }
                onDeleteCard={(cardId) =>
                  dispatch({ type: 'DELETE_CARD', cardId, columnId })
                }
              />
            )
          })}
        </SortableContext>

        <div className="w-72 shrink-0">
          {addingColumn ? (
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/50 p-3">
              <Input
                autoFocus
                placeholder="Título da coluna"
                value={newColumnTitle}
                onChange={(e) => setNewColumnTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddColumn()
                  if (e.key === 'Escape') setAddingColumn(false)
                }}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddColumn}>
                  Adicionar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setAddingColumn(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full border-dashed text-muted-foreground"
              onClick={() => setAddingColumn(true)}
            >
              <PlusIcon className="mr-2 h-4 w-4" />
              Nova coluna
            </Button>
          )}
        </div>
      </div>

      <DragOverlay>
        {activeCard && activeCardColumnId && (
          <KanbanCard
            card={activeCard}
            columnId={activeCardColumnId}
            tags={state.tags}
            onClick={() => {}}
            isDragOverlay
          />
        )}
        {activeId && state.columns[activeId] && (
          <div className="h-16 w-72 rounded-lg border bg-muted/50 opacity-80" />
        )}
      </DragOverlay>
    </DndContext>
  )
}
```

- [ ] **Step 2: Verificar tipos**

```bash
pnpm exec tsc --noEmit
```

Saída esperada: sem erros.

- [ ] **Step 3: Commit**

```bash
git add components/kanban/kanban-board.tsx
git commit -m "feat(kanban): add KanbanBoard with DndContext and DragOverlay"
```

---

## Task 14: Página `/tasks`

**Files:**
- Create: `app/(site)/tasks/page.tsx`

- [ ] **Step 1: Criar `app/(site)/tasks/page.tsx`**

```typescript
import type { Metadata } from 'next'
import { KanbanBoard } from '@/components/kanban/kanban-board'

export const metadata: Metadata = {
  title: 'Mini Kanban',
  manifest: '/manifest.json',
}

export default function TasksPage() {
  return (
    <main className="min-h-screen p-6">
      <KanbanBoard />
    </main>
  )
}
```

- [ ] **Step 2: Iniciar o servidor de dev e verificar a rota**

```bash
pnpm dev
```

Abrir `http://localhost:3000/tasks`. Esperar:
- Título "Mini Kanban" visível
- Botão "Nova coluna" visível
- Botões "Exportar", "Importar", "Tags" no header
- Sem erros no console do browser

- [ ] **Step 3: Verificar tipo e build**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

Saída esperada: sem erros de tipo ou lint.

- [ ] **Step 4: Commit**

```bash
git add app/\(site\)/tasks/page.tsx
git commit -m "feat(kanban): add /tasks route for Mini Kanban PWA"
```

---

## Task 15: Testes Playwright E2E

**Files:**
- Create: `e2e/kanban.spec.ts`

- [ ] **Step 1: Criar `e2e/kanban.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'

test.describe('Mini Kanban Board', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tasks')
    await page.evaluate(() => localStorage.removeItem('kanban-state'))
    await page.reload()
  })

  test('exibe board vazio na primeira visita', async ({ page }) => {
    await expect(page.getByText('Mini Kanban')).toBeVisible()
    await expect(page.getByText('Nova coluna')).toBeVisible()
  })

  test('criar primeira coluna', async ({ page }) => {
    await page.getByText('Nova coluna').click()
    await page.getByPlaceholder('Título da coluna').fill('Backlog')
    await page.getByRole('button', { name: 'Adicionar' }).click()
    await expect(page.getByText('Backlog')).toBeVisible()
  })

  test('criar card em coluna', async ({ page }) => {
    await page.getByText('Nova coluna').click()
    await page.getByPlaceholder('Título da coluna').fill('Backlog')
    await page.getByRole('button', { name: 'Adicionar' }).click()

    await page.getByText('Adicionar card').click()
    await page.getByLabel('Título *').fill('Meu primeiro card')
    await page.getByRole('button', { name: 'Salvar' }).click()

    await expect(page.getByText('Meu primeiro card')).toBeVisible()
  })

  test('editar título de card', async ({ page }) => {
    await page.getByText('Nova coluna').click()
    await page.getByPlaceholder('Título da coluna').fill('Backlog')
    await page.getByRole('button', { name: 'Adicionar' }).click()
    await page.getByText('Adicionar card').click()
    await page.getByLabel('Título *').fill('Card original')
    await page.getByRole('button', { name: 'Salvar' }).click()

    await page.getByText('Card original').click()
    await page.getByLabel('Título *').clear()
    await page.getByLabel('Título *').fill('Card editado')
    await page.getByRole('button', { name: 'Salvar' }).click()

    await expect(page.getByText('Card editado')).toBeVisible()
    await expect(page.getByText('Card original')).not.toBeVisible()
  })

  test('adicionar link ao card', async ({ page }) => {
    await page.getByText('Nova coluna').click()
    await page.getByPlaceholder('Título da coluna').fill('Backlog')
    await page.getByRole('button', { name: 'Adicionar' }).click()

    await page.getByText('Adicionar card').click()
    await page.getByLabel('Título *').fill('Card com link')
    await page.getByRole('button', { name: 'Adicionar link' }).click()
    await page.getByPlaceholder('URL (https://...)').fill('https://example.com')
    await page.getByRole('button', { name: 'Salvar' }).click()

    await expect(page.getByTestId('card-link-indicator')).toBeVisible()
  })

  test('criar tag e atribuir ao card', async ({ page }) => {
    await page.getByText('Nova coluna').click()
    await page.getByPlaceholder('Título da coluna').fill('Backlog')
    await page.getByRole('button', { name: 'Adicionar' }).click()

    await page.getByRole('button', { name: 'Tags' }).click()
    await page.getByPlaceholder('Nome da tag').fill('Frontend')
    await page.getByRole('button', { name: 'Criar tag' }).click()
    await page.keyboard.press('Escape')

    await page.getByText('Adicionar card').click()
    await page.getByLabel('Título *').fill('Card com tag')
    await page.getByRole('button', { name: 'Frontend' }).click()
    await page.getByRole('button', { name: 'Salvar' }).click()

    await expect(page.getByText('Card com tag')).toBeVisible()
    const card = page.locator('[data-card-id]').filter({ hasText: 'Card com tag' })
    await expect(card.getByText('Frontend')).toBeVisible()
  })

  test('deletar card', async ({ page }) => {
    await page.getByText('Nova coluna').click()
    await page.getByPlaceholder('Título da coluna').fill('Backlog')
    await page.getByRole('button', { name: 'Adicionar' }).click()
    await page.getByText('Adicionar card').click()
    await page.getByLabel('Título *').fill('Card para deletar')
    await page.getByRole('button', { name: 'Salvar' }).click()

    await page.getByText('Card para deletar').click()
    await page.getByRole('button', { name: 'Excluir' }).click()
    await page.getByRole('button', { name: 'Confirmar exclusão' }).click()

    await expect(page.getByText('Card para deletar')).not.toBeVisible()
  })

  test('deletar coluna', async ({ page }) => {
    await page.getByText('Nova coluna').click()
    await page.getByPlaceholder('Título da coluna').fill('Para deletar')
    await page.getByRole('button', { name: 'Adicionar' }).click()

    await page
      .getByRole('button', { name: 'Deletar coluna Para deletar' })
      .click()

    await expect(page.getByText('Para deletar')).not.toBeVisible()
  })

  test('exportar board como JSON', async ({ page }) => {
    await page.getByText('Nova coluna').click()
    await page.getByPlaceholder('Título da coluna').fill('Backlog')
    await page.getByRole('button', { name: 'Adicionar' }).click()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar' }).click(),
    ])

    expect(download.suggestedFilename()).toMatch(
      /kanban-backup-\d{4}-\d{2}-\d{2}\.json/,
    )
  })

  test('importar board de arquivo JSON válido', async ({ page }) => {
    const validState = {
      columnOrder: ['col1'],
      columns: {
        col1: { id: 'col1', title: 'Importado', cardIds: ['card1'] },
      },
      cards: {
        card1: {
          id: 'card1',
          title: 'Card importado',
          links: [],
          tagIds: [],
          createdAt: new Date().toISOString(),
        },
      },
      tags: {},
    }

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Importar' }).click(),
    ])

    await fileChooser.setFiles({
      name: 'kanban-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(validState)),
    })

    await expect(page.getByText('Importado')).toBeVisible()
    await expect(page.getByText('Card importado')).toBeVisible()
  })

  test('importar arquivo JSON inválido exibe toast de erro', async ({
    page,
  }) => {
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Importar' }).click(),
    ])

    await fileChooser.setFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{ "invalid": true }'),
    })

    await expect(page.getByText(/Erro ao importar/)).toBeVisible()
  })
})
```

- [ ] **Step 2: Garantir que o dev server está rodando e executar os testes**

```bash
pnpm test:e2e -- e2e/kanban.spec.ts
```

Saída esperada: todos os testes passando. Se algum falhar, investigar o motivo — pode ser um seletor que precisa de ajuste fino (ex: a tag no card pode precisar de `data-card-id` no elemento).

- [ ] **Step 3: Se o teste de tag no card falhar, adicionar `data-card-id` no `KanbanCard`**

Em `components/kanban/kanban-card.tsx`, adicionar o atributo na `<div>` externa:

```typescript
// Adicionar na div raiz do KanbanCard (após ref e style):
data-card-id={card.id}
```

Retestar:
```bash
pnpm test:e2e -- e2e/kanban.spec.ts
```

Saída esperada: todos os testes passando.

- [ ] **Step 4: Commit**

```bash
git add e2e/kanban.spec.ts
git commit -m "test(kanban): add Playwright E2E tests for all critical flows"
```

---

## Task 16: Atualizar CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Adicionar seção Kanban ao CLAUDE.md**

Localizar a seção `### Key directories (updated)` em `CLAUDE.md` e adicionar as seguintes linhas na tabela:

```markdown
| `components/kanban/`       | Kanban board: Board, Column, Card, modais, headers  |
| `app/(site)/tasks/`        | Rota `/tasks` — Mini Kanban PWA                     |
| `hooks/use-kanban-store.ts`| Reducer Kanban + persistência localStorage           |
| `lib/kanban-schema.ts`     | Tipos TypeScript + schema Zod + TAG_COLORS           |
| `lib/kanban-export.ts`     | Export (download JSON) + parseImport (validação Zod) |
```

- [ ] **Step 2: Adicionar nota sobre @dnd-kit e Playwright Kanban**

Após a tabela de comandos existente, adicionar:

```markdown
### Mini Kanban PWA (`/tasks`)

- **Rota:** `app/(site)/tasks/page.tsx` dentro do layout do site
- **Estado:** `useKanbanStore` (`hooks/use-kanban-store.ts`) — `useReducer` + `localStorage` (chave `"kanban-state"`)
- **Drag and drop:** `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`
- **PWA:** `public/manifest.json` + `public/sw.js` + `public/icons/icon.svg`; SW registrado via `useEffect` em `KanbanBoard`
- **Export/Import:** `lib/kanban-export.ts` — download JSON / validação Zod antes de importar
- **E2E:** `e2e/kanban.spec.ts` cobre todos os fluxos críticos (criar coluna, criar card, editar, tags, links, deletar, export/import)
```

- [ ] **Step 3: Verificar lint**

```bash
pnpm lint
```

Saída esperada: sem erros.

- [ ] **Step 4: Commit final**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with Kanban PWA architecture and test coverage"
```
