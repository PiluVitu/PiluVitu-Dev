# Distribuição de artigos — Fase 1 (Web /admin) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Pré-requisito:** o plano backend (`2026-06-10-distribuicao-fase1-backend-go.md`) deve estar executado e mergeado — esta fase consome os endpoints `/admin/llm/*` e `/admin/distribution/*`.

**Goal:** Adicionar ao editor de posts do `/admin` (a) um botão "Corrigir texto" que chama o Ollama local e mostra um diff aceitar/rejeitar, e (b) uma tela "Distribuição" que gera propostas (republicação + chamadas sociais editáveis com refino por IA) e publica nos selecionados, mostrando status por alvo.

**Architecture:** Client fino `lib/admin/atelier/api.ts` reusando o envelope/`ApiError` do `lib/votacao/api-client.ts`, falando com a Go API via `NEXT_PUBLIC_API_URL` + `credentials:'include'` (mesma sessão Google do `/admin`). Lógica de diff é TS puro testável (`lib/admin/atelier/word-diff.ts`). Componentes em `components/admin/posts/`, hooks TanStack Query em `hooks/admin/atelier/`. Tudo degrada com aviso quando a API/túnel está off (erro → toast).

**Tech Stack:** Next.js 16 / React 19 / TS strict, TanStack Query 5, shadcn/ui, sonner (toast), Jest (jsdom), Storybook, Playwright. Colocation obrigatória.

> **⚠️ Convenção de testes (override deste plano, confirmado no repo):** o `apps/web` **NÃO** tem `@testing-library/react` instalado e não há nenhum `*.test.tsx` de componente — a verificação de **componente** no projeto é via **Storybook (`.stories.tsx`) + Playwright E2E**, e o **Jest** cobre só **lógica pura/serviços** (`.test.ts`). Portanto: `word-diff.ts` e `api.ts` ganham `*.test.ts` (Jest, sem RTL — o teste de `api` mocka `global.fetch`); os componentes (`ProofreadButton`, `DistributionPanel`) ganham **só `.stories.tsx`** (sem `.test.tsx`/RTL) e têm o comportamento coberto pelo **E2E** (Task 8). **Não instalar `@testing-library/*`.** As Tasks 5 e 6 abaixo mostram blocos de teste RTL — **ignore-os**; implemente componente + story e deixe o comportamento pro E2E.

---

## File Structure

**Criar:**

| Arquivo                                                                                  | Responsabilidade                                                  |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `apps/web/lib/admin/atelier/types.ts`                                                    | Tipos `DistributionTarget`, `SelectedTarget`, `ProposalsBody`     |
| `apps/web/lib/admin/atelier/api.ts`                                                      | `atelierApi` (proofread/refine/proposals/getDistribution/publish) |
| `apps/web/lib/admin/atelier/api.test.ts`                                                 | Testes do client (fetch mockado)                                  |
| `apps/web/lib/admin/atelier/word-diff.ts`                                                | Diff por palavra (puro)                                           |
| `apps/web/lib/admin/atelier/word-diff.test.ts`                                           | Testes do diff                                                    |
| `apps/web/lib/admin/atelier/platform-meta.ts`                                            | Limites de chars + labels por plataforma                          |
| `apps/web/hooks/admin/atelier/use-proofread.ts`                                          | Mutation proofread                                                |
| `apps/web/hooks/admin/atelier/use-distribution.ts`                                       | Mutations proposals/refine/publish + query getDistribution        |
| `apps/web/components/admin/posts/proofread-button.tsx` (+ `.test.tsx`, `.stories.tsx`)   | Botão + diálogo de diff                                           |
| `apps/web/components/admin/posts/distribution-panel.tsx` (+ `.test.tsx`, `.stories.tsx`) | Tela de distribuição                                              |
| `apps/web/app/(admin)/admin/posts/atelier.e2e.ts`                                        | E2E (corrigir → propor → publicar) com API mockada                |

**Modificar:**

- `apps/web/components/admin/posts/post-editor.tsx` — montar `<ProofreadButton>` (toolbar) e `<DistributionPanel>` (aba/seção).
- `apps/web/CLAUDE.md` — documentar o botão Corrigir + tela Distribuição.

---

### Task 1: Tipos + platform-meta

**Files:**

- Create: `apps/web/lib/admin/atelier/types.ts`
- Create: `apps/web/lib/admin/atelier/platform-meta.ts`

- [ ] **Step 1: Implementar tipos**

`types.ts`:

```ts
export type DistributionKind = 'article_crosspost' | 'social_hook'
export type DistributionStatus = 'pending' | 'posted' | 'failed' | 'skipped'

export interface DistributionTarget {
  slug: string
  platform: string
  kind: DistributionKind
  content: string
  status: DistributionStatus
  remote_url: string
  error: string
}

export interface SelectedTarget {
  platform: string
  content: string
  title?: string
  canonical_url?: string
  description?: string
  tags?: string[]
}

export interface ProposalsBody {
  slug: string
  title: string
  excerpt: string
  url: string
  body: string
  tags: string[]
}
```

`platform-meta.ts`:

```ts
export interface PlatformMeta {
  label: string
  charLimit?: number // só p/ social_hook
}

export const PLATFORM_META: Record<string, PlatformMeta> = {
  devto: { label: 'dev.to' },
  hashnode: { label: 'Hashnode' },
  bluesky: { label: 'Bluesky', charLimit: 300 },
  mastodon: { label: 'Mastodon', charLimit: 500 },
}

export function platformLabel(platform: string): string {
  return PLATFORM_META[platform]?.label ?? platform
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/admin/atelier/types.ts apps/web/lib/admin/atelier/platform-meta.ts
git commit -m "feat(web): tipos + metadados de plataforma do atelier"
```

---

### Task 2: Diff por palavra (puro, TDD)

**Files:**

- Create: `apps/web/lib/admin/atelier/word-diff.ts`
- Test: `apps/web/lib/admin/atelier/word-diff.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { wordDiff } from './word-diff'

describe('wordDiff', () => {
  it('marca palavras iguais como equal', () => {
    const segs = wordDiff('oi mundo', 'oi mundo')
    expect(segs.every((s) => s.type === 'equal')).toBe(true)
    expect(segs.map((s) => s.value).join('')).toBe('oi mundo')
  })

  it('marca substituição como remove + add', () => {
    const segs = wordDiff('txto', 'texto')
    const removed = segs.filter((s) => s.type === 'remove').map((s) => s.value)
    const added = segs.filter((s) => s.type === 'add').map((s) => s.value)
    expect(removed).toContain('txto')
    expect(added).toContain('texto')
  })

  it('reconstrói o original juntando equal+remove e o corrigido juntando equal+add', () => {
    const segs = wordDiff('um dios tres', 'um dois tres')
    const original = segs
      .filter((s) => s.type !== 'add')
      .map((s) => s.value)
      .join('')
    const corrected = segs
      .filter((s) => s.type !== 'remove')
      .map((s) => s.value)
      .join('')
    expect(original).toBe('um dios tres')
    expect(corrected).toBe('um dois tres')
  })
})
```

- [ ] **Step 2: Ver falhar**

Run: `cd apps/web && pnpm jest lib/admin/atelier/word-diff -t wordDiff`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar (LCS por token, preservando espaços)**

```ts
export type DiffSegment = { type: 'equal' | 'add' | 'remove'; value: string }

/** Tokeniza preservando os espaços como tokens próprios (p/ reconstrução fiel). */
function tokenize(s: string): string[] {
  return s.match(/\s+|\S+/g) ?? []
}

/**
 * wordDiff devolve segmentos para renderizar um diff inline:
 * - 'equal' aparece nos dois textos
 * - 'remove' só no original
 * - 'add' só no corrigido
 * Algoritmo: LCS clássico (matriz) sobre tokens.
 */
export function wordDiff(original: string, corrected: string): DiffSegment[] {
  const a = tokenize(original)
  const b = tokenize(corrected)
  const m = a.length
  const n = b.length

  // matriz LCS (m+1)x(n+1)
  const lcs: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  )
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const out: DiffSegment[] = []
  const push = (type: DiffSegment['type'], value: string) => {
    const last = out[out.length - 1]
    if (last && last.type === type) last.value += value
    else out.push({ type, value })
  }

  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      push('equal', a[i])
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push('remove', a[i])
      i++
    } else {
      push('add', b[j])
      j++
    }
  }
  while (i < m) push('remove', a[i++])
  while (j < n) push('add', b[j++])
  return out
}
```

- [ ] **Step 4: Ver passar**

Run: `cd apps/web && pnpm jest lib/admin/atelier/word-diff`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/atelier/word-diff.ts apps/web/lib/admin/atelier/word-diff.test.ts
git commit -m "feat(web): word-diff puro (LCS) p/ revisão de texto"
```

---

### Task 3: API client + teste (fetch mockado)

**Files:**

- Create: `apps/web/lib/admin/atelier/api.ts`
- Test: `apps/web/lib/admin/atelier/api.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { atelierApi } from './api'

describe('atelierApi', () => {
  const realFetch = global.fetch
  afterEach(() => {
    global.fetch = realFetch
  })

  it('proofread desembrulha o envelope e devolve corrected', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: { corrected: 'texto ok' },
        notifications: [],
      }),
    }) as unknown as typeof fetch

    const res = await atelierApi.proofread('txto')
    expect(res.corrected).toBe('texto ok')

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(init.credentials).toBe('include')
    expect(JSON.parse(init.body)).toEqual({ text: 'txto' })
  })

  it('lança ApiError em status !ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        ok: false,
        data: null,
        notifications: [
          { type: 'error', code: 'llm_unavailable', message: 'off' },
        ],
      }),
    }) as unknown as typeof fetch

    await expect(atelierApi.proofread('x')).rejects.toMatchObject({
      status: 503,
      code: 'llm_unavailable',
    })
  })
})
```

- [ ] **Step 2: Ver falhar**

Run: `cd apps/web && pnpm jest lib/admin/atelier/api`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
import { apiBase, ApiError, type ApiEnvelope } from '@/lib/votacao/api-client'
import type { DistributionTarget, ProposalsBody, SelectedTarget } from './types'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  let env: ApiEnvelope<T> | null = null
  if (res.status !== 204) {
    env = (await res.json().catch(() => null)) as ApiEnvelope<T> | null
  }
  if (!res.ok) {
    const notifications = env?.notifications ?? [
      { type: 'error' as const, message: `${res.status} ${res.statusText}` },
    ]
    throw new ApiError(res.status, notifications)
  }
  return (env?.data ?? undefined) as T
}

export const atelierApi = {
  proofread: (text: string) =>
    call<{ corrected: string }>('/admin/llm/proofread', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  refine: (platform: string, text: string, instruction: string) =>
    call<{ refined: string }>('/admin/llm/refine', {
      method: 'POST',
      body: JSON.stringify({ platform, text, instruction }),
    }),
  proposals: (body: ProposalsBody) =>
    call<{ targets: DistributionTarget[] }>('/admin/distribution/proposals', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getDistribution: (slug: string) =>
    call<{ targets: DistributionTarget[] }>(
      `/admin/distribution/${encodeURIComponent(slug)}`,
    ),
  publish: (slug: string, targets: SelectedTarget[]) =>
    call<{ targets: DistributionTarget[] }>(
      `/admin/distribution/${encodeURIComponent(slug)}/publish`,
      { method: 'POST', body: JSON.stringify({ targets }) },
    ),
}
```

- [ ] **Step 4: Ver passar**

Run: `cd apps/web && pnpm jest lib/admin/atelier/api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/atelier/api.ts apps/web/lib/admin/atelier/api.test.ts
git commit -m "feat(web): atelierApi (proofread/refine/proposals/publish)"
```

---

### Task 4: Hooks TanStack Query

**Files:**

- Create: `apps/web/hooks/admin/atelier/use-proofread.ts`
- Create: `apps/web/hooks/admin/atelier/use-distribution.ts`

- [ ] **Step 1: Implementar (sem teste unitário — cobertos via componentes/E2E)**

`use-proofread.ts`:

```ts
'use client'

import { useMutation } from '@tanstack/react-query'
import { atelierApi } from '@/lib/admin/atelier/api'

export function useProofread() {
  return useMutation({
    mutationFn: (text: string) => atelierApi.proofread(text),
  })
}
```

`use-distribution.ts`:

```ts
'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { atelierApi } from '@/lib/admin/atelier/api'
import type { ProposalsBody, SelectedTarget } from '@/lib/admin/atelier/types'

export function useDistribution(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ['distribution', slug],
    queryFn: () => atelierApi.getDistribution(slug),
    enabled,
  })
}

export function useBuildProposals() {
  return useMutation({
    mutationFn: (body: ProposalsBody) => atelierApi.proposals(body),
  })
}

export function useRefineHook() {
  return useMutation({
    mutationFn: (v: { platform: string; text: string; instruction: string }) =>
      atelierApi.refine(v.platform, v.text, v.instruction),
  })
}

export function usePublishDistribution(slug: string) {
  return useMutation({
    mutationFn: (targets: SelectedTarget[]) =>
      atelierApi.publish(slug, targets),
  })
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add apps/web/hooks/admin/atelier/
git commit -m "feat(web): hooks atelier (proofread/proposals/refine/publish)"
```

---

### Task 5: `<ProofreadButton>` + diálogo de diff

**Files:**

- Create: `apps/web/components/admin/posts/proofread-button.tsx`
- Test: `apps/web/components/admin/posts/proofread-button.test.tsx`
- Story: `apps/web/components/admin/posts/proofread-button.stories.tsx`

> Usa `components/ui/dialog`, `components/ui/button` (shadcn já presentes no projeto). Se algum não existir, gere com `pnpm dlx shadcn@latest add dialog button`.

- [ ] **Step 1: Teste que falha**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProofreadButton } from './proofread-button'

jest.mock('@/lib/admin/atelier/api', () => ({
  atelierApi: {
    proofread: jest.fn().mockResolvedValue({ corrected: 'texto corrigido' }),
  },
}))

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

describe('ProofreadButton', () => {
  it('corrige e aplica ao aceitar', async () => {
    const onApply = jest.fn()
    render(wrap(<ProofreadButton body="txto corrigido" onApply={onApply} />))

    fireEvent.click(screen.getByRole('button', { name: /corrigir texto/i }))
    // diálogo abre com o resultado
    await waitFor(() =>
      expect(screen.getByText(/revisão/i)).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /aplicar/i }))
    expect(onApply).toHaveBeenCalledWith('texto corrigido')
  })

  it('desabilita quando body vazio', () => {
    render(wrap(<ProofreadButton body="" onApply={jest.fn()} />))
    expect(
      screen.getByRole('button', { name: /corrigir texto/i }),
    ).toBeDisabled()
  })
})
```

- [ ] **Step 2: Ver falhar**

Run: `cd apps/web && pnpm jest components/admin/posts/proofread-button`
Expected: FAIL (componente não existe).

- [ ] **Step 3: Implementar**

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useProofread } from '@/hooks/admin/atelier/use-proofread'
import { errorMessage } from '@/lib/votacao/api-client'
import { wordDiff } from '@/lib/admin/atelier/word-diff'

interface ProofreadButtonProps {
  body: string
  onApply: (corrected: string) => void
}

export function ProofreadButton({ body, onApply }: ProofreadButtonProps) {
  const [open, setOpen] = useState(false)
  const [corrected, setCorrected] = useState('')
  const proofread = useProofread()

  async function run() {
    try {
      const res = await proofread.mutateAsync(body)
      setCorrected(res.corrected)
      setOpen(true)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const segments = open ? wordDiff(body, corrected) : []

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!body.trim() || proofread.isPending}
        onClick={run}
      >
        {proofread.isPending ? 'Corrigindo…' : 'Corrigir texto'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Revisão da IA</DialogTitle>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-auto rounded-md border p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap">
            {segments.map((s, i) => {
              if (s.type === 'equal') return <span key={i}>{s.value}</span>
              if (s.type === 'add')
                return (
                  <span key={i} className="bg-ok/20 text-ok rounded">
                    {s.value}
                  </span>
                )
              return (
                <span
                  key={i}
                  className="bg-destructive/20 text-destructive rounded line-through"
                >
                  {s.value}
                </span>
              )
            })}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Rejeitar
            </Button>
            <Button
              type="button"
              onClick={() => {
                onApply(corrected)
                setOpen(false)
                toast.success('Texto corrigido aplicado.')
              }}
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 4: Ver passar**

Run: `cd apps/web && pnpm jest components/admin/posts/proofread-button`
Expected: PASS.

- [ ] **Step 5: Story**

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProofreadButton } from './proofread-button'

const meta: Meta<typeof ProofreadButton> = {
  title: 'Admin/Posts/ProofreadButton',
  component: ProofreadButton,
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof ProofreadButton>

export const Default: Story = {
  args: { body: 'Um txeto com algums erros de digitaçao.', onApply: () => {} },
}

export const Disabled: Story = { args: { body: '', onApply: () => {} } }
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/admin/posts/proofread-button.tsx apps/web/components/admin/posts/proofread-button.test.tsx apps/web/components/admin/posts/proofread-button.stories.tsx
git commit -m "feat(web): ProofreadButton com diálogo de diff (aceitar/rejeitar)"
```

---

### Task 6: `<DistributionPanel>`

**Files:**

- Create: `apps/web/components/admin/posts/distribution-panel.tsx`
- Test: `apps/web/components/admin/posts/distribution-panel.test.tsx`
- Story: `apps/web/components/admin/posts/distribution-panel.stories.tsx`

- [ ] **Step 1: Teste que falha**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DistributionPanel } from './distribution-panel'
import type { DistributionTarget } from '@/lib/admin/atelier/types'

const targets: DistributionTarget[] = [
  {
    slug: 'p',
    platform: 'devto',
    kind: 'article_crosspost',
    content: 'corpo',
    status: 'pending',
    remote_url: '',
    error: '',
  },
  {
    slug: 'p',
    platform: 'bluesky',
    kind: 'social_hook',
    content: 'chamada bsky',
    status: 'pending',
    remote_url: '',
    error: '',
  },
]

jest.mock('@/lib/admin/atelier/api', () => ({
  atelierApi: {
    proposals: jest.fn().mockResolvedValue({ targets }),
    refine: jest.fn().mockResolvedValue({ refined: 'chamada refinada' }),
    publish: jest.fn().mockResolvedValue({
      targets: [
        { ...targets[0], status: 'posted', remote_url: 'https://dev.to/p' },
        { ...targets[1], status: 'posted', remote_url: 'https://bsky.app/p' },
      ],
    }),
    getDistribution: jest.fn().mockResolvedValue({ targets: [] }),
  },
}))

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

const post = {
  slug: 'p',
  title: 'T',
  excerpt: 'e',
  body: 'corpo',
  tags: ['go'],
}

describe('DistributionPanel', () => {
  it('gera propostas e renderiza alvos editáveis', async () => {
    render(wrap(<DistributionPanel post={post} />))
    fireEvent.click(screen.getByRole('button', { name: /gerar propostas/i }))
    await waitFor(() =>
      expect(screen.getByText(/Bluesky/i)).toBeInTheDocument(),
    )
    expect(screen.getByDisplayValue('chamada bsky')).toBeInTheDocument()
  })

  it('publica e mostra link de sucesso', async () => {
    render(wrap(<DistributionPanel post={post} />))
    fireEvent.click(screen.getByRole('button', { name: /gerar propostas/i }))
    await waitFor(() => screen.getByText(/Bluesky/i))
    fireEvent.click(
      screen.getByRole('button', { name: /publicar selecionadas/i }),
    )
    await waitFor(() =>
      expect(screen.getAllByText(/posted|publicado/i).length).toBeGreaterThan(
        0,
      ),
    )
  })
})
```

- [ ] **Step 2: Ver falhar**

Run: `cd apps/web && pnpm jest components/admin/posts/distribution-panel`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  useBuildProposals,
  usePublishDistribution,
  useRefineHook,
} from '@/hooks/admin/atelier/use-distribution'
import { PLATFORM_META, platformLabel } from '@/lib/admin/atelier/platform-meta'
import type {
  DistributionTarget,
  SelectedTarget,
} from '@/lib/admin/atelier/types'
import { errorMessage } from '@/lib/votacao/api-client'

interface PostInput {
  slug: string
  title: string
  excerpt: string
  body: string
  tags: string[]
}

const PUBLIC_BASE = 'https://piluvitu.com.br/posts'

export function DistributionPanel({ post }: { post: PostInput }) {
  const [targets, setTargets] = useState<DistributionTarget[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [instructions, setInstructions] = useState<Record<string, string>>({})

  const build = useBuildProposals()
  const refine = useRefineHook()
  const publish = usePublishDistribution(post.slug)

  const url = `${PUBLIC_BASE}/${post.slug}`

  async function generate() {
    try {
      const res = await build.mutateAsync({
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        url,
        body: post.body,
        tags: post.tags,
      })
      setTargets(res.targets)
      setSelected(
        Object.fromEntries(res.targets.map((t) => [t.platform, true])),
      )
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  function setContent(platform: string, content: string) {
    setTargets((ts) =>
      ts.map((t) => (t.platform === platform ? { ...t, content } : t)),
    )
  }

  async function refineOne(platform: string) {
    const t = targets.find((x) => x.platform === platform)
    if (!t) return
    try {
      const res = await refine.mutateAsync({
        platform,
        text: t.content,
        instruction: instructions[platform] ?? '',
      })
      setContent(platform, res.refined)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  async function publishSelected() {
    const payload: SelectedTarget[] = targets
      .filter((t) => selected[t.platform])
      .map((t) =>
        t.kind === 'article_crosspost'
          ? {
              platform: t.platform,
              content: t.content,
              title: post.title,
              canonical_url: url,
              description: post.excerpt,
              tags: post.tags,
            }
          : { platform: t.platform, content: t.content },
      )
    try {
      const res = await publish.mutateAsync(payload)
      setTargets(res.targets)
      toast.success('Publicação concluída.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  if (targets.length === 0) {
    return (
      <Button type="button" onClick={generate} disabled={build.isPending}>
        {build.isPending ? 'Gerando…' : 'Gerar propostas'}
      </Button>
    )
  }

  const articles = targets.filter((t) => t.kind === 'article_crosspost')
  const socials = targets.filter((t) => t.kind === 'social_hook')

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-muted-foreground font-mono text-sm">
          Republicar artigo (canonical → {url})
        </h3>
        {articles.map((t) => (
          <TargetRow
            key={t.platform}
            target={t}
            selected={!!selected[t.platform]}
            onToggle={(v) => setSelected((s) => ({ ...s, [t.platform]: v }))}
          />
        ))}
      </section>

      <section className="space-y-4">
        <h3 className="text-muted-foreground font-mono text-sm">
          Chamadas sociais (editáveis)
        </h3>
        {socials.map((t) => {
          const limit = PLATFORM_META[t.platform]?.charLimit
          return (
            <div key={t.platform} className="space-y-2 rounded-md border p-3">
              <TargetRow
                target={t}
                selected={!!selected[t.platform]}
                onToggle={(v) =>
                  setSelected((s) => ({ ...s, [t.platform]: v }))
                }
              />
              <Textarea
                value={t.content}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setContent(t.platform, e.target.value)
                }
                rows={3}
              />
              {limit ? (
                <p
                  className={`text-right text-xs ${t.content.length > limit ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {t.content.length}/{limit}
                </p>
              ) : null}
              <div className="flex gap-2">
                <Input
                  placeholder="instrução (ex.: deixa mais informal)"
                  value={instructions[t.platform] ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setInstructions((s) => ({
                      ...s,
                      [t.platform]: e.target.value,
                    }))
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={refine.isPending}
                  onClick={() => refineOne(t.platform)}
                >
                  Refinar IA
                </Button>
              </div>
            </div>
          )
        })}
      </section>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={generate}
          disabled={build.isPending}
        >
          Regerar todas
        </Button>
        <Button
          type="button"
          onClick={publishSelected}
          disabled={publish.isPending}
        >
          {publish.isPending ? 'Publicando…' : 'Publicar selecionadas'}
        </Button>
      </div>
    </div>
  )
}

function TargetRow({
  target,
  selected,
  onToggle,
}: {
  target: DistributionTarget
  selected: boolean
  onToggle: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onToggle(e.target.checked)
          }
        />
        {platformLabel(target.platform)}
      </label>
      <StatusBadge target={target} />
    </div>
  )
}

function StatusBadge({ target }: { target: DistributionTarget }) {
  if (target.status === 'posted')
    return (
      <a
        href={target.remote_url}
        target="_blank"
        rel="noreferrer"
        className="text-ok text-xs underline"
      >
        ✅ publicado
      </a>
    )
  if (target.status === 'failed')
    return (
      <span className="text-destructive text-xs" title={target.error}>
        ❌ falhou
      </span>
    )
  return <span className="text-muted-foreground text-xs">⏳ pendente</span>
}
```

> Se `components/ui/textarea` ou `components/ui/input` não existirem, gere com `pnpm dlx shadcn@latest add textarea input`.

- [ ] **Step 4: Ver passar**

Run: `cd apps/web && pnpm jest components/admin/posts/distribution-panel`
Expected: PASS.

- [ ] **Step 5: Story**

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DistributionPanel } from './distribution-panel'

const meta: Meta<typeof DistributionPanel> = {
  title: 'Admin/Posts/DistributionPanel',
  component: DistributionPanel,
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof DistributionPanel>

export const Default: Story = {
  args: {
    post: {
      slug: 'meu-post',
      title: 'Meu Post',
      excerpt: 'resumo',
      body: '# corpo',
      tags: ['go', 'ai'],
    },
  },
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/admin/posts/distribution-panel.tsx apps/web/components/admin/posts/distribution-panel.test.tsx apps/web/components/admin/posts/distribution-panel.stories.tsx
git commit -m "feat(web): DistributionPanel (propostas, refino, status por alvo)"
```

---

### Task 7: Montar no editor de posts

**Files:**

- Modify: `apps/web/components/admin/posts/post-editor.tsx`

> O editor tem estado `fm` (frontmatter) e `body` (`setBody`). Verifique os nomes exatos no arquivo antes de editar; adapte se diferirem.

- [ ] **Step 1: Importar os componentes**

No topo de `post-editor.tsx`:

```tsx
import { ProofreadButton } from './proofread-button'
import { DistributionPanel } from './distribution-panel'
```

- [ ] **Step 2: Botão Corrigir perto da toolbar**

Localize onde a `<MdxToolbar>` é renderizada e adicione ao lado:

```tsx
<ProofreadButton body={body} onApply={setBody} />
```

- [ ] **Step 3: Painel de Distribuição**

Adicione uma seção/aba abaixo do editor (ou um card na sidebar) que monta o painel com os dados atuais do post:

```tsx
<DistributionPanel
  post={{
    slug: fm.slug,
    title: fm.title,
    excerpt: fm.excerpt ?? '',
    body,
    tags: fm.tags ?? [],
  }}
/>
```

> Mostre o painel só quando `fm.slug` existir (post já salvo) e `!fm.draft` (ou sempre, com aviso de que publicar distribui o artigo). Decida conforme o fluxo do editor; o mínimo é renderizar quando há slug.

- [ ] **Step 4: Type-check + lint + build**

Run: `cd apps/web && pnpm exec tsc --noEmit && pnpm lint && pnpm --filter @piluvitu/web build`
Expected: tudo verde. (Atenção à pegadinha implicit-any da Vercel — todos os callbacks já estão anotados.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/admin/posts/post-editor.tsx
git commit -m "feat(web): montar ProofreadButton + DistributionPanel no editor de posts"
```

---

### Task 8: E2E + documentação

**Files:**

- Create: `apps/web/app/(admin)/admin/posts/atelier.e2e.ts`
- Modify: `apps/web/CLAUDE.md`

> Mocks **host-agnósticos** com `page.route('**/admin/llm/proofread', …)` etc. (não hardcodar `localhost:8080`), seguindo o padrão de `votacao.e2e.ts`. Corpos no envelope `{ok,data,notifications}`.

- [ ] **Step 1: Escrever o E2E**

```ts
import { test, expect } from '@playwright/test'

const envelope = (data: unknown) => ({ ok: true, data, notifications: [] })

test.describe('Atelier de distribuição', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/admin/llm/proofread', (route) =>
      route.fulfill({
        json: envelope({ corrected: 'Texto corrigido pela IA.' }),
      }),
    )
    await page.route('**/admin/distribution/proposals', (route) =>
      route.fulfill({
        json: envelope({
          targets: [
            {
              slug: 'p',
              platform: 'devto',
              kind: 'article_crosspost',
              content: 'corpo',
              status: 'pending',
              remote_url: '',
              error: '',
            },
            {
              slug: 'p',
              platform: 'bluesky',
              kind: 'social_hook',
              content: 'chamada bsky',
              status: 'pending',
              remote_url: '',
              error: '',
            },
          ],
        }),
      }),
    )
    await page.route('**/admin/distribution/*/publish', (route) =>
      route.fulfill({
        json: envelope({
          targets: [
            {
              slug: 'p',
              platform: 'devto',
              kind: 'article_crosspost',
              content: 'corpo',
              status: 'posted',
              remote_url: 'https://dev.to/p',
              error: '',
            },
            {
              slug: 'p',
              platform: 'bluesky',
              kind: 'social_hook',
              content: 'chamada bsky',
              status: 'posted',
              remote_url: 'https://bsky.app/p',
              error: '',
            },
          ],
        }),
      }),
    )
  })

  // Navegue até o editor de um post e exercite os fluxos.
  // Ajuste a rota/seed conforme a forma de abrir o editor no /admin (auth mockada).
  test('corrige texto, gera propostas e publica', async ({ page }) => {
    // TODO de seed/login: reaproveite o setup de auth usado em outros e2e do /admin,
    // ou navegue direto à rota do editor com o estado necessário.
    // O foco do teste é: botão "Corrigir texto" abre diff e aplica; "Gerar propostas"
    // lista Bluesky/dev.to; "Publicar selecionadas" mostra os links ✅.
    expect(true).toBeTruthy()
  })
})
```

> **Importante:** este E2E depende de como o `/admin` autentica/abre o editor nos outros testes. Antes de implementar, leia `apps/web/app/(site)/votacao/votacao.e2e.ts` e qualquer e2e existente do `/admin` para reusar o padrão de login/seed. Substitua o `expect(true)` por interações reais (`getByRole('button', { name: /corrigir texto/i })`, etc.). Não deixe o placeholder no commit final.

- [ ] **Step 2: Rodar o E2E**

Run: `pnpm --filter @piluvitu/web test:e2e --grep "Atelier"`
Expected: PASS (após substituir o placeholder por interações reais).

- [ ] **Step 3: Documentar**

Em `apps/web/CLAUDE.md`, na seção "Slice ③ (Posts + editor MDX)" ou numa subseção nova "Atelier (distribuição via LLM local)", documente: o botão "Corrigir texto" (chama `/admin/llm/proofread` na Go API, diff aceitar/rejeitar) e a tela "Distribuição" (`/admin/distribution/*`, propostas editáveis + refino + status). Aponte que a feature depende do túnel/Ollama up (degrada com toast quando off).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/(admin)/admin/posts/atelier.e2e.ts apps/web/CLAUDE.md
git commit -m "test(web): E2E do atelier + docs"
```

---

## Self-Review (preencher ao final da execução)

- [ ] **Spec coverage:** botão Corrigir + diff ✅ (Task 5); tela Distribuição editável + refino + status ✅ (Task 6); republicação vs chamadas ✅ (separadas no painel); char counters ✅; degradação por toast ✅ (errorMessage). Wiring no editor ✅ (Task 7); E2E ✅ (Task 8).
- [ ] **Placeholder scan:** o único placeholder intencional é o seed/login do E2E (Task 8) — **deve** ser substituído por interações reais antes do commit; está sinalizado.
- [ ] **Type consistency:** `DistributionTarget`/`SelectedTarget`/`ProposalsBody` idênticos entre `types.ts`, `api.ts`, hooks e componentes. `wordDiff` retorna `DiffSegment[]` consumido pelo `ProofreadButton`. Callbacks de libs (`onChange`, etc.) anotados explicitamente (pegadinha Vercel implicit-any).
- [ ] **Verificação final:** `pnpm prettier:fix && pnpm lint && make test && pnpm --filter @piluvitu/web build`.

```

```
