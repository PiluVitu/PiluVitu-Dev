# Votação de Filmes — Fase 7: Next.js UI (MVP)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Construir as páginas e componentes Next.js mínimos para que um usuário possa logar via Google, ver sessões existentes, votar, e (se admin) criar/fechar sessões. Storybook completo e E2E exaustivo ficam para a Fase 8.

**Architecture:**
- **Client-side fetch com `credentials: 'include'`** para todas as chamadas à Go API. O cookie de sessão é setado pela API (domínio `localhost:8080` em dev, `api.piluvitu.com.br` em prod) e enviado de volta automaticamente.
- **Login/logout** = navegação top-level (`<a href={apiBase + '/auth/google/login'}>`) — não fetch, pra preservar o redirect 302 → Google.
- **TanStack Query** para listas e detalhes (já configurado no projeto). Mutations para criar sessão e votar.
- **shadcn/ui** para Button, Card, Badge, Dialog, Input, Label, Skeleton (todos já no projeto).
- **Server components mínimos**: cada rota é praticamente "use client" para reaproveitar TanStack Query. SEO via metadata estática.

**Tech Stack:** Next.js 16, React 19, TanStack Query 5, shadcn/ui (existing), Tailwind 4.

**Pré-requisitos:** Fases 1-6 commitadas. Branch `feat/votacao-fase7` partindo de `feat/votacao-fase6`.

---

## File Structure

```
apps/web/lib/votacao/
  types.ts                 # VotingSession, SessionMovie, Vote, Backup, User
  api-client.ts            # apiBase + typed fetch wrappers
apps/web/hooks/votacao/
  use-session-list.ts      # useQuery wrapper
  use-session-detail.ts
  use-vote-mutation.ts
  use-create-session.ts
  use-close-session.ts
  use-current-user.ts
apps/web/components/votacao/
  login-button.tsx         # client; href apiBase + /auth/google/login
  logout-button.tsx        # client; calls /auth/logout then router.refresh
  movie-card.tsx           # poster + title + radio
  vote-section.tsx         # form with radios + submit
  session-status-badge.tsx
  create-session-form.tsx  # admin
  results-list.tsx
  session-card.tsx         # row in /votacao list
apps/web/app/(site)/votacao/
  page.tsx                 # list of sessions + login/CTA
  [id]/page.tsx            # detail + vote/results
  admin/page.tsx           # admin panel (create + close)
CLAUDE.md                  # MODIFIED: document /votacao UI
```

> **No new dependencies.** Project already has TanStack Query, shadcn/ui, lucide-react.

---

## Task 1: Types + API client

**Files:**
- Create: `apps/web/lib/votacao/types.ts`
- Create: `apps/web/lib/votacao/api-client.ts`

### 1.1 types.ts

```ts
export interface User {
  id: number
  email: string
  name: string
  picture: string
  is_admin: boolean
}

export interface VotingSession {
  ID: number
  Title: string
  Status: 'open' | 'closed'
  CreatedBy: number
  CreatedAt: string
  ClosedAt?: string | null
  WinnerMovieID?: number | null
  SortOptionsJSON: string
}

export interface SessionMovie {
  ID: number
  SessionID: number
  Category: string
  Title: string
  Type: 'filme' | 'serie'
  PosterURL: string
  TMDbID?: number | null
  WasWatched: boolean
  SheetNumber?: number | null
}

export interface SessionDetail {
  session: VotingSession
  movies: SessionMovie[]
  has_voted: boolean
}

export interface SessionListResponse {
  sessions: VotingSession[]
}

export interface ResultsResponse {
  results: { movie_id: number; count: number }[]
  total_votes: number
}

export interface CategoriesResponse {
  categories: string[]
}

export interface CreateSessionBody {
  title: string
  types: string[]
  include_watched: boolean
  categories: string[]
}
```

### 1.2 api-client.ts

```ts
import type {
  CategoriesResponse,
  CreateSessionBody,
  ResultsResponse,
  SessionDetail,
  SessionListResponse,
  User,
  VotingSession,
} from './types'

export const apiBase =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const votacaoApi = {
  me: () => call<User>('/auth/me'),
  logout: () => call<void>('/auth/logout', { method: 'POST' }),

  listSessions: () => call<SessionListResponse>('/votacao/sessions'),
  getSession: (id: number) =>
    call<SessionDetail>(`/votacao/sessions/${id}`),
  vote: (id: number, movieId: number) =>
    call<void>(`/votacao/sessions/${id}/votes`, {
      method: 'POST',
      body: JSON.stringify({ movie_id: movieId }),
    }),
  closeSession: (id: number) =>
    call<{ winner_movie_id: number | null }>(
      `/votacao/sessions/${id}/close`,
      { method: 'POST' },
    ),
  results: (id: number) =>
    call<ResultsResponse>(`/votacao/sessions/${id}/results`),

  categories: () => call<CategoriesResponse>('/votacao/categorias'),
  createSession: (body: CreateSessionBody) =>
    call<SessionDetail>('/votacao/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}

export const loginHref = `${apiBase}/auth/google/login`
```

### 1.3 Verify + commit

```bash
cd apps/web && pnpm exec tsc --noEmit
git add apps/web/lib/votacao/
git commit -m "feat(web/votacao): types + API client wrappers"
```

---

## Task 2: TanStack Query hooks

**File:** `apps/web/hooks/votacao/use-current-user.ts` and others.

```ts
// hooks/votacao/use-current-user.ts
'use client'
import { useQuery } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function useCurrentUser() {
  return useQuery({
    queryKey: ['votacao', 'me'],
    queryFn: () => votacaoApi.me(),
    retry: false,
    staleTime: 60_000,
  })
}
```

```ts
// hooks/votacao/use-session-list.ts
'use client'
import { useQuery } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function useSessionList() {
  return useQuery({
    queryKey: ['votacao', 'sessions'],
    queryFn: () => votacaoApi.listSessions(),
    staleTime: 30_000,
  })
}
```

```ts
// hooks/votacao/use-session-detail.ts
'use client'
import { useQuery } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function useSessionDetail(id: number) {
  return useQuery({
    queryKey: ['votacao', 'sessions', id],
    queryFn: () => votacaoApi.getSession(id),
    enabled: Number.isFinite(id) && id > 0,
  })
}

export function useResults(id: number, enabled = true) {
  return useQuery({
    queryKey: ['votacao', 'sessions', id, 'results'],
    queryFn: () => votacaoApi.results(id),
    enabled: enabled && id > 0,
  })
}
```

```ts
// hooks/votacao/use-vote-mutation.ts
'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function useVoteMutation(sessionId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (movieId: number) => votacaoApi.vote(sessionId, movieId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['votacao', 'sessions', sessionId] })
      qc.invalidateQueries({
        queryKey: ['votacao', 'sessions', sessionId, 'results'],
      })
    },
  })
}
```

```ts
// hooks/votacao/use-create-session.ts
'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'
import type { CreateSessionBody } from '@/lib/votacao/types'

export function useCreateSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateSessionBody) => votacaoApi.createSession(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['votacao', 'sessions'] })
    },
  })
}
```

```ts
// hooks/votacao/use-close-session.ts
'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function useCloseSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => votacaoApi.closeSession(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['votacao', 'sessions'] })
      qc.invalidateQueries({ queryKey: ['votacao', 'sessions', id] })
    },
  })
}
```

```bash
git add apps/web/hooks/votacao/
git commit -m "feat(web/votacao): TanStack Query hooks for sessions/votes/results"
```

---

## Task 3: Reusable components

Create the following under `apps/web/components/votacao/`:

### login-button.tsx

```tsx
'use client'
import { Button } from '@/components/ui/button'
import { loginHref } from '@/lib/votacao/api-client'

export function LoginButton() {
  return (
    <Button asChild>
      <a href={loginHref}>Entrar com Google</a>
    </Button>
  )
}
```

### logout-button.tsx

```tsx
'use client'
import { Button } from '@/components/ui/button'
import { useQueryClient } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function LogoutButton() {
  const qc = useQueryClient()
  return (
    <Button
      variant="outline"
      onClick={async () => {
        await votacaoApi.logout().catch(() => null)
        qc.clear()
        window.location.reload()
      }}
    >
      Sair
    </Button>
  )
}
```

### session-status-badge.tsx

```tsx
import { Badge } from '@/components/ui/badge'

export function SessionStatusBadge({ status }: { status: 'open' | 'closed' }) {
  return (
    <Badge variant={status === 'open' ? 'default' : 'secondary'}>
      {status === 'open' ? 'Aberta' : 'Encerrada'}
    </Badge>
  )
}
```

### movie-card.tsx

```tsx
'use client'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import type { SessionMovie } from '@/lib/votacao/types'

interface Props {
  movie: SessionMovie
  selected?: boolean
  onSelect?: () => void
  disabled?: boolean
}

export function MovieCard({ movie, selected, onSelect, disabled }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-all',
        selected && 'ring-2 ring-primary',
        disabled && 'cursor-not-allowed opacity-60',
        !disabled && 'hover:shadow-lg',
      )}
    >
      <div className="aspect-[2/3] w-full bg-muted">
        {movie.PosterURL ? (
          <Image
            src={movie.PosterURL}
            alt={movie.Title}
            width={400}
            height={600}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            sem pôster
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {movie.Category}
        </p>
        <h3 className="font-semibold leading-tight">{movie.Title}</h3>
        <p className="text-xs text-muted-foreground mt-1">
          {movie.Type === 'serie' ? 'Série' : 'Filme'}
          {movie.WasWatched && ' • já assistido'}
        </p>
      </div>
    </button>
  )
}
```

> Add `image.tmdb.org` to `next.config.mjs` `images.remotePatterns` so Next/Image accepts the TMDb CDN. Plan note: do this in Task 6 (final sweep).

### vote-section.tsx

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { MovieCard } from './movie-card'
import { useVoteMutation } from '@/hooks/votacao/use-vote-mutation'
import type { SessionMovie } from '@/lib/votacao/types'

interface Props {
  sessionId: number
  movies: SessionMovie[]
  alreadyVoted: boolean
  closed: boolean
}

export function VoteSection({ sessionId, movies, alreadyVoted, closed }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const mutation = useVoteMutation(sessionId)

  const lockedReason = closed
    ? 'Sessão encerrada — votação fechada.'
    : alreadyVoted
      ? 'Você já votou nesta sessão.'
      : null

  return (
    <div className="space-y-6">
      {lockedReason && (
        <p className="rounded-md border bg-muted px-4 py-3 text-sm">
          {lockedReason}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {movies.map((m) => (
          <MovieCard
            key={m.ID}
            movie={m}
            selected={selected === m.ID}
            onSelect={() => setSelected(m.ID)}
            disabled={!!lockedReason}
          />
        ))}
      </div>
      {!lockedReason && (
        <div className="flex justify-end">
          <Button
            disabled={!selected || mutation.isPending}
            onClick={() => {
              if (!selected) return
              mutation.mutate(selected, {
                onSuccess: () => toast.success('Voto registrado'),
                onError: (err) => toast.error(String(err)),
              })
            }}
          >
            {mutation.isPending ? 'Enviando…' : 'Votar'}
          </Button>
        </div>
      )}
    </div>
  )
}
```

### session-card.tsx

```tsx
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SessionStatusBadge } from './session-status-badge'
import type { VotingSession } from '@/lib/votacao/types'

export function SessionCard({ session }: { session: VotingSession }) {
  return (
    <Link href={`/votacao/${session.ID}`} className="block">
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <CardTitle className="text-lg">{session.Title}</CardTitle>
          <SessionStatusBadge status={session.Status} />
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            criada em{' '}
            {new Date(session.CreatedAt).toLocaleString('pt-BR')}
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}
```

### results-list.tsx

```tsx
'use client'
import { useResults } from '@/hooks/votacao/use-session-detail'
import type { SessionMovie } from '@/lib/votacao/types'

interface Props {
  sessionId: number
  movies: SessionMovie[]
}

export function ResultsList({ sessionId, movies }: Props) {
  const { data, isLoading } = useResults(sessionId)
  if (isLoading) return <p className="text-muted-foreground">Carregando resultados…</p>
  if (!data) return null

  const movieById = Object.fromEntries(movies.map((m) => [m.ID, m]))
  const total = data.total_votes || 1

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Total de votos: <strong>{data.total_votes}</strong>
      </p>
      <ul className="space-y-2">
        {data.results.map((r) => {
          const movie = movieById[r.movie_id]
          const pct = ((r.count / total) * 100).toFixed(0)
          return (
            <li
              key={r.movie_id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <div>
                <p className="font-medium">{movie?.Title ?? `Filme ${r.movie_id}`}</p>
                {movie && (
                  <p className="text-xs text-muted-foreground">
                    {movie.Category}
                  </p>
                )}
              </div>
              <span className="text-sm font-mono">
                {r.count} ({pct}%)
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

### create-session-form.tsx

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useCreateSession } from '@/hooks/votacao/use-create-session'
import { useRouter } from 'next/navigation'

export function CreateSessionForm() {
  const [title, setTitle] = useState('')
  const [includeFilme, setIncludeFilme] = useState(true)
  const [includeSerie, setIncludeSerie] = useState(true)
  const [includeWatched, setIncludeWatched] = useState(false)
  const router = useRouter()
  const mutation = useCreateSession()

  const types: string[] = []
  if (includeFilme) types.push('filme')
  if (includeSerie) types.push('serie')

  return (
    <form
      className="space-y-4 max-w-md"
      onSubmit={(e) => {
        e.preventDefault()
        if (!title.trim()) return toast.error('Título obrigatório')
        mutation.mutate(
          { title: title.trim(), types, include_watched: includeWatched, categories: [] },
          {
            onSuccess: (data) => {
              toast.success('Sessão criada')
              router.push(`/votacao/${data.session.ID}`)
            },
            onError: (err) => toast.error(String(err)),
          },
        )
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="title">Título</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Sexta 22/05"
          required
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Tipos</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeFilme}
            onChange={(e) => setIncludeFilme(e.target.checked)}
          />
          Filme
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeSerie}
            onChange={(e) => setIncludeSerie(e.target.checked)}
          />
          Série
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeWatched}
            onChange={(e) => setIncludeWatched(e.target.checked)}
          />
          Incluir já assistidos
        </label>
      </fieldset>
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Sorteando…' : 'Criar sessão'}
      </Button>
    </form>
  )
}
```

```bash
git add apps/web/components/votacao/
git commit -m "feat(web/votacao): movie-card, vote-section, status-badge, login/logout, create-form, results-list, session-card"
```

---

## Task 4: /votacao page (list)

Create `apps/web/app/(site)/votacao/page.tsx`:

```tsx
'use client'
import { LoginButton } from '@/components/votacao/login-button'
import { LogoutButton } from '@/components/votacao/logout-button'
import { SessionCard } from '@/components/votacao/session-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentUser } from '@/hooks/votacao/use-current-user'
import { useSessionList } from '@/hooks/votacao/use-session-list'
import Link from 'next/link'

export default function VotacaoPage() {
  const user = useCurrentUser()
  const list = useSessionList()

  return (
    <main className="container mx-auto max-w-4xl space-y-8 px-4 py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Votação de Filmes</h1>
          <p className="text-muted-foreground">
            Sessões em aberto e histórico recente.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {user.isLoading ? (
            <Skeleton className="h-10 w-32" />
          ) : user.data ? (
            <>
              <span className="text-sm text-muted-foreground">
                {user.data.name} {user.data.is_admin && '(admin)'}
              </span>
              {user.data.is_admin && (
                <Link
                  href="/votacao/admin"
                  className="text-sm underline underline-offset-2"
                >
                  Painel admin
                </Link>
              )}
              <LogoutButton />
            </>
          ) : (
            <LoginButton />
          )}
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Sessões</h2>
        {list.isLoading && (
          <div className="grid gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {list.error && (
          <p className="text-destructive text-sm">Erro ao carregar sessões.</p>
        )}
        {list.data?.sessions.length === 0 && (
          <p className="text-muted-foreground">
            Nenhuma sessão ainda. {user.data?.is_admin && 'Crie a primeira no painel admin.'}
          </p>
        )}
        <div className="grid gap-3">
          {list.data?.sessions.map((s) => (
            <SessionCard key={s.ID} session={s} />
          ))}
        </div>
      </section>
    </main>
  )
}
```

```bash
git add apps/web/app/\(site\)/votacao/page.tsx
git commit -m "feat(web): /votacao page lists sessions + login state"
```

---

## Task 5: /votacao/[id] page (detail + vote + results)

Create `apps/web/app/(site)/votacao/[id]/page.tsx`:

```tsx
'use client'
import { use } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { SessionStatusBadge } from '@/components/votacao/session-status-badge'
import { VoteSection } from '@/components/votacao/vote-section'
import { ResultsList } from '@/components/votacao/results-list'
import { LoginButton } from '@/components/votacao/login-button'
import { useCurrentUser } from '@/hooks/votacao/use-current-user'
import { useSessionDetail } from '@/hooks/votacao/use-session-detail'
import { useCloseSession } from '@/hooks/votacao/use-close-session'
import { toast } from 'sonner'

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: idStr } = use(params)
  const id = Number(idStr)

  const user = useCurrentUser()
  const detail = useSessionDetail(id)
  const close = useCloseSession()

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-12">
        <p className="text-destructive">ID inválido.</p>
      </main>
    )
  }

  if (detail.isLoading) {
    return (
      <main className="container mx-auto max-w-4xl space-y-6 px-4 py-12">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </main>
    )
  }

  if (!detail.data) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-12">
        <p className="text-destructive">
          {String(detail.error ?? 'Sessão não encontrada.')}
        </p>
        {!user.data && (
          <div className="mt-4">
            <LoginButton />
          </div>
        )}
      </main>
    )
  }

  const { session, movies, has_voted } = detail.data
  const closed = session.Status === 'closed'

  return (
    <main className="container mx-auto max-w-4xl space-y-8 px-4 py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{session.Title}</h1>
          <p className="text-muted-foreground text-sm">
            criada em {new Date(session.CreatedAt).toLocaleString('pt-BR')}
          </p>
        </div>
        <SessionStatusBadge status={session.Status} />
      </header>

      {!user.data && !user.isLoading && (
        <div className="rounded-md border bg-muted/50 p-4">
          <p className="text-sm mb-2">Você precisa estar logado pra votar.</p>
          <LoginButton />
        </div>
      )}

      {closed ? (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Resultados</h2>
          <ResultsList sessionId={id} movies={movies} />
        </section>
      ) : (
        <VoteSection
          sessionId={id}
          movies={movies}
          alreadyVoted={has_voted}
          closed={closed}
        />
      )}

      {user.data?.is_admin && !closed && (
        <div className="border-t pt-4">
          <Button
            variant="destructive"
            disabled={close.isPending}
            onClick={() =>
              close.mutate(id, {
                onSuccess: (data) =>
                  toast.success(
                    data.winner_movie_id
                      ? `Encerrada. Vencedor: ${data.winner_movie_id}`
                      : 'Encerrada sem votos.',
                  ),
                onError: (err) => toast.error(String(err)),
              })
            }
          >
            {close.isPending ? 'Encerrando…' : 'Encerrar sessão'}
          </Button>
        </div>
      )}
    </main>
  )
}
```

```bash
git add apps/web/app/\(site\)/votacao/\[id\]/page.tsx
git commit -m "feat(web): /votacao/[id] page with vote, results, admin close"
```

---

## Task 6: /votacao/admin page

Create `apps/web/app/(site)/votacao/admin/page.tsx`:

```tsx
'use client'
import { Skeleton } from '@/components/ui/skeleton'
import { CreateSessionForm } from '@/components/votacao/create-session-form'
import { useCurrentUser } from '@/hooks/votacao/use-current-user'

export default function VotacaoAdminPage() {
  const user = useCurrentUser()

  if (user.isLoading) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-12">
        <Skeleton className="h-10 w-1/2" />
      </main>
    )
  }

  if (!user.data?.is_admin) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-bold">Acesso negado</h1>
        <p className="text-muted-foreground mt-2">
          Esta página é restrita a administradores.
        </p>
      </main>
    )
  }

  return (
    <main className="container mx-auto max-w-2xl space-y-8 px-4 py-12">
      <header>
        <h1 className="text-3xl font-bold">Painel admin</h1>
        <p className="text-muted-foreground">
          Crie uma nova sessão de votação (sorteio puxado da planilha + TMDb).
        </p>
      </header>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Nova sessão</h2>
        <CreateSessionForm />
      </section>
    </main>
  )
}
```

```bash
git add apps/web/app/\(site\)/votacao/admin/page.tsx
git commit -m "feat(web): /votacao/admin page with create-session form"
```

---

## Task 7: next.config remote pattern + sample story + CLAUDE.md + final sweep

### 7.1 next.config.mjs

In `apps/web/next.config.mjs`, add `image.tmdb.org` to `images.remotePatterns`. The existing pattern set should already include other hosts; just add:

```js
{ protocol: 'https', hostname: 'image.tmdb.org' },
```

### 7.2 One Storybook story for movie-card

Create `apps/web/components/votacao/movie-card.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { MovieCard } from './movie-card'

const meta: Meta<typeof MovieCard> = {
  title: 'Votacao/MovieCard',
  component: MovieCard,
}
export default meta
type Story = StoryObj<typeof MovieCard>

const baseMovie = {
  ID: 1,
  SessionID: 10,
  Category: 'terror',
  Title: 'A Coisa',
  Type: 'filme' as const,
  PosterURL: 'https://image.tmdb.org/t/p/w500/sample.jpg',
  TMDbID: 550,
  WasWatched: false,
  SheetNumber: 42,
}

export const Default: Story = { args: { movie: baseMovie } }
export const Selected: Story = { args: { movie: baseMovie, selected: true } }
export const NoPoster: Story = {
  args: { movie: { ...baseMovie, PosterURL: '' } },
}
export const Watched: Story = {
  args: { movie: { ...baseMovie, WasWatched: true } },
}
```

### 7.3 CLAUDE.md

Update Status:
```
- **Status:** em construção (Fase 7 concluída: Next.js UI MVP; ...).
```

Append a new sub-section after "Backup + Cron":

```markdown
#### UI Votação (`apps/web/app/(site)/votacao`)

- **Rotas:** `/votacao` (lista + login state), `/votacao/[id]` (detalhe + votar + resultados quando fechada + botão admin pra encerrar), `/votacao/admin` (form criar sessão — só admin enxerga).
- **API client:** `apps/web/lib/votacao/api-client.ts` faz fetch com `credentials: 'include'` contra `NEXT_PUBLIC_API_URL` (default `http://localhost:8080`). Para login, o componente `<LoginButton>` faz navegação top-level pro endpoint `/auth/google/login` da API.
- **TanStack Query:** hooks em `apps/web/hooks/votacao/`. Queries para me/list/detail/results; mutations para vote/create/close. `onSuccess` invalida queries pra refletir mudança imediata.
- **Componentes:** `apps/web/components/votacao/` (MovieCard, VoteSection, ResultsList, SessionCard, SessionStatusBadge, CreateSessionForm, LoginButton, LogoutButton).
- **Next/Image:** posters do TMDb (`image.tmdb.org/t/p/w500/...`) — `image.tmdb.org` registrado em `next.config.mjs` `images.remotePatterns`.
- **Skip da Fase 8:** Storybook completo de cada componente + E2E exaustivo (`votacao.spec.ts`). Só uma story de exemplo (`movie-card.stories.tsx`) e nenhum E2E nesta fase.
```

Add to env vars list (if not already):
```markdown
- `NEXT_PUBLIC_API_URL` — base URL da Go API consumida pelo front (default `http://localhost:8080`).
```

### 7.4 Final sweep

```bash
cd apps/web && pnpm exec tsc --noEmit
cd apps/web && pnpm lint
cd .. && cd apps/api && go vet ./... && go test ./...
git add apps/web/next.config.mjs apps/web/components/votacao/movie-card.stories.tsx CLAUDE.md
git commit -m "docs/web(votacao): next.config TMDb host, sample story, CLAUDE.md docs"
```

---

## Phase 7 Exit Criteria

- [ ] `tsc --noEmit` clean
- [ ] `pnpm lint` clean
- [ ] All Go tests still pass (144)
- [ ] /votacao loads → shows login state OR list of sessions
- [ ] /votacao/[id] renders detail + lets logged-in users vote
- [ ] /votacao/admin shows create form for admins only
- [ ] CLAUDE.md updated

---

## Notes for the implementer

- **Do NOT** add new dependencies. Project already has TanStack Query (`@tanstack/react-query`), shadcn/ui (Button, Card, Badge, Input, Label, Skeleton, Sonner), Tailwind 4, lucide-react.
- **Pages are all `'use client'`.** Server components are overkill for an MVP where every page reads user state. Future polish in Phase 8 can move read-only pages back to SSR.
- **Login flow:** browser navigates to `apiBase/auth/google/login`. After Google auth, API redirects back to `WEB_REDIRECT_URL` (set in API env, typically `/votacao`).
- **CORS:** API already has `AllowCredentials: true` + explicit origins (Phase 2). Front must send `credentials: 'include'` on every fetch.
- **Linting:** `apps/web` uses ESLint via Next.js. If `pnpm lint` flags `<img>` instead of `next/image`, the plan already uses `next/image`.
- **No tests in this phase.** Component tests + Playwright E2E are explicit Phase 8 deliverables to keep this phase small and shippable.
- 7 commits in this phase.
