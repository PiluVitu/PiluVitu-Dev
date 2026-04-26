# Mini Kanban PWA — Design Spec

**Data:** 2026-04-26
**Status:** Aprovado

---

## Visão Geral

Board estilo Trello acessível em `/tasks` no site existente. Toda a persistência fica em `localStorage` — sem backend. Suporta instalação como PWA, drag and drop de cards e colunas, tags coloridas, links em cards e exportação/importação do estado completo como JSON.

---

## Modelo de Dados

```typescript
type Tag = {
  id: string        // nanoid
  label: string
  color: string     // ex: "hsl(220 70% 50%)"
}

type CardLink = {
  url: string
  label?: string    // texto de exibição opcional
}

type Card = {
  id: string        // nanoid
  title: string
  description?: string
  links: CardLink[]
  tagIds: string[]
  createdAt: string // ISO 8601
}

type Column = {
  id: string        // nanoid
  title: string
  cardIds: string[] // ordem dos cards na coluna
}

type KanbanState = {
  columnOrder: string[]              // ordem das colunas no board
  columns: Record<string, Column>
  cards: Record<string, Card>
  tags: Record<string, Tag>
}
```

**Persistência:** `localStorage` chave `"kanban-state"`. Estado serializado via `JSON.stringify` após cada action do reducer.

**IDs:** `nanoid` (já no projeto).

**Validação de import:** `zod` (já no projeto) valida o schema antes de substituir o estado.

---

## Arquitetura

### Rota

`app/(site)/tasks/page.tsx` — dentro do layout do site existente (`app/(site)/layout.tsx`). A página é um Client Component (`"use client"`) pois depende de `localStorage` e interações.

### Gerenciamento de Estado

Hook `useKanbanStore` com `useReducer`. Actions:

| Action | Efeito |
|---|---|
| `ADD_COLUMN` | Cria coluna vazia, append em `columnOrder` |
| `UPDATE_COLUMN_TITLE` | Edita título da coluna |
| `DELETE_COLUMN` | Remove coluna e todos os cards dela |
| `REORDER_COLUMNS` | Atualiza `columnOrder` após drag |
| `ADD_CARD` | Cria card, append em `column.cardIds` |
| `UPDATE_CARD` | Edita título, descrição, links, tagIds |
| `DELETE_CARD` | Remove card da coluna e do map |
| `MOVE_CARD` | Move card entre colunas (ou reordena na mesma) |
| `ADD_TAG` | Cria tag global |
| `UPDATE_TAG` | Edita label/cor da tag |
| `DELETE_TAG` | Remove tag e limpa referências em cards |
| `IMPORT_STATE` | Substitui estado completo (via import JSON) |
| `RESET_STATE` | Volta ao estado inicial vazio |

Toda action executa `localStorage.setItem("kanban-state", JSON.stringify(newState))` no hook após o dispatch.

### Árvore de Componentes

```
KanbanBoard                          ← DndContext raiz
├── BoardHeader
│   ├── ExportButton
│   ├── ImportButton (file input oculto)
│   └── TagManagerButton → TagManagerDialog
├── ColumnList (SortableContext horizontal)
│   └── KanbanColumn (Sortable)     ← droppable
│       ├── ColumnHeader (editável inline)
│       ├── CardList (SortableContext vertical)
│       │   └── KanbanCard (Sortable)
│       └── AddCardButton
└── DragOverlay
    └── KanbanCard (clone fantasma)
```

### Componentes

**`KanbanBoard`** — monta `DndContext` com sensors (mouse, touch, teclado), gerencia `onDragStart`/`onDragEnd` e decide se o drop é mudança de coluna ou reordenação.

**`KanbanColumn`** — coluna droppável. Header com edição inline ao clicar no título (input substituindo o `<h3>`). Botão "+" abre `CardModal` em modo criação.

**`KanbanCard`** — card arrastável. Exibe título truncado, badges das tags e ícone de link se houver links. Clique abre `CardModal` em modo edição.

**`CardModal`** (Dialog shadcn/ui) — formulário completo do card:
- Input de título (obrigatório)
- Textarea de descrição
- Lista de links: cada item tem input de URL + input de label opcional + botão remover
- Botão "Adicionar link"
- Multi-select de tags (badges clicáveis, toggle)
- Botão "Deletar card" (destrutivo, com confirmação inline)

**`TagManagerDialog`** (Dialog shadcn/ui) — CRUD de tags globais:
- Lista de tags existentes com preview de cor, label e botão deletar
- Form de criação: input de label + paleta de cores pré-definidas (badges clicáveis, ~10 opções) para manter consistência com o design system shadcn/ui

**`TagBadge`** — Badge shadcn/ui com cor de fundo calculada via `style` inline.

**`ExportButton`** — cria um Blob JSON e dispara download como `kanban-backup-YYYY-MM-DD.json`.

**`ImportButton`** — `<input type="file" accept=".json">` oculto. Ao selecionar arquivo: `FileReader.readAsText` → `JSON.parse` → validação zod → dispatch `IMPORT_STATE`. Erros exibidos via `sonner` (já no projeto).

---

## PWA

### Arquivos

```
public/
  manifest.json
  sw.js
  icons/
    icon-192.png   ← ícone PWA 192×192 (gerado via script Node simples durante dev)
    icon-512.png   ← ícone PWA 512×512 (gerado via script Node simples durante dev)
```

### `public/manifest.json`

```json
{
  "name": "Mini Kanban",
  "short_name": "Kanban",
  "start_url": "/tasks",
  "display": "standalone",
  "background_color": "#020817",
  "theme_color": "#020817",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### `public/sw.js`

Service worker mínimo cache-first para assets estáticos do `/tasks`. Estratégia: cache on install, network fallback.

### Registro do SW

No `app/(site)/tasks/page.tsx`, via `useEffect` (não no layout raiz para não registrar o SW nas páginas do admin/keystatic):

```typescript
useEffect(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
  }
}, [])

### Metadata no Next.js

Em `app/(site)/tasks/page.tsx`:

```typescript
export const metadata = {
  title: 'Mini Kanban',
  manifest: '/manifest.json',
}
```

---

## Export / Import

**Export:**
1. Serializa `KanbanState` como JSON com indentação
2. Cria `Blob` com `type: "application/json"`
3. Cria URL temporária e dispara `<a download="kanban-backup-YYYY-MM-DD.json">`

**Import:**
1. `<input type="file" accept=".json">` oculto, acionado pelo botão visível
2. `FileReader.readAsText` → `JSON.parse`
3. Validação com schema zod espelhando `KanbanState`
4. Se válido: dispatch `IMPORT_STATE` e toast de sucesso via sonner
5. Se inválido: toast de erro descritivo

---

## Testes

### Storybook (UI + estados)

| Story | Arquivo |
|---|---|
| `KanbanCard` — vazio, com tags, com links, com tudo | `stories/KanbanCard.stories.tsx` |
| `KanbanColumn` — vazia, com cards, título editando | `stories/KanbanColumn.stories.tsx` |
| `TagBadge` — cores variadas | `stories/TagBadge.stories.tsx` |
| `CardModal` — modo criação, modo edição | `stories/CardModal.stories.tsx` |
| `TagManagerDialog` — sem tags, com tags | `stories/TagManagerDialog.stories.tsx` |

### Playwright E2E

Arquivo: `e2e/kanban.spec.ts`

| Teste | Cenário |
|---|---|
| Criar primeira coluna | Board vazio → adicionar coluna → verificar título |
| Criar card em coluna | Coluna existente → abrir modal → preencher → salvar → card visível |
| Editar card | Clicar no card → editar título → salvar → título atualizado |
| Adicionar link ao card | CardModal → adicionar URL → salvar → ícone de link visível |
| Criar tag e atribuir ao card | TagManager → criar tag → CardModal → selecionar tag → badge no card |
| Mover card entre colunas | Drag card de coluna A para coluna B |
| Deletar card | CardModal → botão deletar → card removido |
| Deletar coluna | Header da coluna → deletar → coluna removida |
| Export | Clicar Export → verificar download do arquivo JSON |
| Import | Importar arquivo JSON válido → estado restaurado |
| Import inválido | Importar JSON malformado → toast de erro |

---

## Dependências Novas

| Pacote | Versão | Motivo |
|---|---|---|
| `@dnd-kit/core` | latest | Drag and drop |
| `@dnd-kit/sortable` | latest | Sortable lists |
| `@dnd-kit/utilities` | latest | Helpers (CSS transforms) |

Todos os outros componentes reutilizam dependências já no projeto.

---

## Estrutura de Arquivos

```
app/(site)/tasks/
  page.tsx                    ← Client Component, metadata PWA
  layout.tsx                  ← opcional, se precisar de layout específico

components/kanban/
  kanban-board.tsx
  kanban-column.tsx
  kanban-card.tsx
  card-modal.tsx
  tag-badge.tsx
  tag-manager-dialog.tsx
  board-header.tsx
  add-card-button.tsx
  column-header.tsx

hooks/
  use-kanban-store.ts         ← useReducer + localStorage

lib/
  kanban-schema.ts            ← tipos TypeScript + schema zod
  kanban-export.ts            ← export/import helpers

stories/
  KanbanCard.stories.tsx
  KanbanColumn.stories.tsx
  TagBadge.stories.tsx
  CardModal.stories.tsx
  TagManagerDialog.stories.tsx

e2e/
  kanban.spec.ts

public/
  manifest.json
  sw.js
  icons/
    icon-192.png
    icon-512.png
```

---

## CLAUDE.md — Atualizações Necessárias

Após implementação, atualizar `CLAUDE.md` para registrar:
- Rota `/tasks` com Mini Kanban PWA
- Playwright em uso para fluxos do Kanban (`e2e/kanban.spec.ts`)
- `@dnd-kit/*` como dependência de drag and drop
- `public/manifest.json` e `public/sw.js` para PWA
