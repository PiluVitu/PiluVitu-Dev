# Admin Unificado — Slice ④ Mídia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A DS V2 media library at `/admin/midia` that uploads images (binary) to the site repo's `public/media/` via git, lists/deletes them, and an `<ImageField>` (library picker + manual path/URL) wired into the image fields across the slice ②/③ forms.

**Architecture:** New engine primitive `commitBinary` commits base64 image bytes straight to GitHub (no utf8 re-encode). `lib/admin/media-io.ts` (server) lists `public/media/` + sanitizes filenames; `lib/admin/media-url.ts` (client-safe) maps `/media/*` → a `raw.githubusercontent.com` URL for immediate preview (the stored field value stays `/media/<file>`, served by the site after redeploy). Routes + optimistic hooks + a reusable `MediaGrid` power both the `/admin/midia` page and the `MediaPickerDialog` inside `ImageField`.

**Tech Stack:** Next.js 16 (route handlers, async params/cookies), slice ① engine (`git-write.ts`), `@octokit/rest`, slice ② field primitives + `DeleteConfirmDialog` + hooks pattern, slice ②/③ forms, TanStack Query, Jest (node for libs), Storybook 10, Playwright. No new deps.

**Depends on:** slice ① (#36), ② (#37), ③ (#38). **Branch off `main` after #38 merges** (it wires `<ImageField>` into `post-frontmatter-form.tsx` from slice ③, and reuses `git-write.ts`, `content-api.ts`, slugify, the slice ② forms + field primitives).

**Spec:** `docs/superpowers/specs/2026-06-04-admin-unificado-midia-slice4-design.md`

**Conventions:** Commands in the devcontainer; Jest/lint/build from `apps/web`. Commit after each task. Lib tests `/** @jest-environment node */`.

---

## Key facts (from prior slices)

- Engine `lib/admin/git-write.ts`: `commitFile(auth, opts, deps?)` does `content: Buffer.from(opts.content,'utf8').toString('base64')` (line ~163). Helpers: `repoSlug(repo)`, `ghRefresh` (= `refreshToken` from `./github-oauth`), `statusOf(err)`, `OctokitLike` (with `repos.getContent`/`createOrUpdateFileContents`), `CommitResult`, `AdminGithubToken`, the dynamic `@octokit/rest` import in the default `makeOctokit`. `deleteFile` exists.
- Octokit `repos.getContent` on a directory returns `{ name, path, type, size, sha }[]`.
- `lib/admin/content-api.ts`: `getLinkedToken`, `jsonError(status, code, message, fields?)`, `resealIfRefreshed(result)`.
- `lib/admin/slugify.ts`: `slugify(s)`.
- `next.config.mjs` `images.remotePatterns` already includes `raw.githubusercontent.com`.
- Forms to wire (image fields): `components/admin/content/project-form.tsx` (`projectLogo`, `image`), `carreira-form.tsx` (`image`), `social-form.tsx` (`image`), `profile-form.tsx` (`avatarSrc`), `components/admin/posts/post-frontmatter-form.tsx` (`coverImage`). All use `TextField` from `@/components/admin/content/fields` today.
- Sidebar `components/admin/admin-sidebar.tsx` has a "Mídia" item under the **Site** group (slice ①); CRUMB map in `app/(admin)/admin/layout.tsx`.

---

## File structure

```
lib/admin/git-write.ts (MODIFY) (+ .test)      + commitBinary (base64 passthrough)
lib/admin/media-url.ts (+ .test)               mediaRawUrl (CLIENT-safe; repo slug)
lib/admin/media-io.ts (+ .test)                listMedia / sanitizeFilename / uniqueFilename (server)
app/api/admin/media/route.ts                   GET list + POST upload
app/api/admin/media/[name]/route.ts            DELETE
hooks/admin/media/use-media-list.ts
hooks/admin/media/use-media-mutations.ts       upload + delete (optimistic)
components/admin/media/media-card.tsx (+ .stories)
components/admin/media/media-grid.tsx (+ .stories)
components/admin/media/media-picker-dialog.tsx (+ .stories)
components/admin/content/image-field.tsx (+ .stories)
app/(admin)/admin/midia/page.tsx (+ midia.e2e.ts)
components/admin/content/project-form.tsx (MODIFY)
components/admin/content/carreira-form.tsx (MODIFY)
components/admin/content/social-form.tsx (MODIFY)
components/admin/content/profile-form.tsx (MODIFY)
components/admin/posts/post-frontmatter-form.tsx (MODIFY)
components/admin/admin-sidebar.tsx (MODIFY) + app/(admin)/admin/layout.tsx (MODIFY)
CLAUDE.md (MODIFY)
```

---

# Phase A — Engine + IO

## Task 1: `commitBinary` (base64 passthrough)

**Files:** Modify `apps/web/lib/admin/git-write.ts`; extend `git-write.test.ts`.

- [ ] **Step 1: Add the failing test** — append a `describe('commitBinary', ...)` to `git-write.test.ts`:

```ts
describe('commitBinary', () => {
  it('passes the base64 straight through (no utf8 re-encode)', async () => {
    const { commitBinary } = await import('./git-write')
    const PNG_B64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    let sent = ''
    const octokit: OctokitLike = {
      repos: {
        async getContent() {
          throw Object.assign(new Error('Not Found'), { status: 404 })
        }, // new file
        async createOrUpdateFileContents(p) {
          sent = p.content
          return { data: { commit: { sha: 'c1' } } }
        },
      },
    }
    const res = await commitBinary(
      { token: 't', login: 'me' },
      {
        repo: 'site',
        path: 'public/media/x.png',
        base64: PNG_B64,
        message: 'up',
      },
      { makeOctokit: () => octokit },
    )
    expect(res.commitSha).toBe('c1')
    expect(sent).toBe(PNG_B64) // exact passthrough — NOT Buffer.from(b64,'utf8')
  })
  it('throws AdminAuthError when not linked', async () => {
    const { commitBinary } = await import('./git-write')
    await expect(
      commitBinary(null, {
        repo: 'site',
        path: 'public/media/x.png',
        base64: 'AAAA',
        message: 'm',
      }),
    ).rejects.toBeInstanceOf(AdminAuthError)
  })
})
```

(`AdminAuthError`, `OctokitLike` are already imported in the test file.)

- [ ] **Step 2: Run it (fails)** — `cd apps/web && pnpm test git-write` → FAIL (commitBinary not exported).

- [ ] **Step 3: Implement `commitBinary`** in `git-write.ts` (after `commitFile`):

```ts
export async function commitBinary(
  auth: AdminGithubToken | null,
  opts: {
    repo: Repo
    path: string
    base64: string
    message: string
    branch?: string
  },
  deps: CommitDeps = {},
): Promise<CommitResult> {
  if (!auth) throw new AdminAuthError()
  const makeOctokit =
    deps.makeOctokit ??
    ((token: string) => new Octokit({ auth: token }) as unknown as OctokitLike)
  const refresh = deps.refresh ?? ghRefresh
  const { owner, repo } = repoSlug(opts.repo)
  const branch = opts.branch ?? 'main'

  const run = async (token: string): Promise<string> => {
    const octokit = await Promise.resolve(makeOctokit(token))
    let sha: string | undefined
    try {
      const existing = await octokit.repos.getContent({
        owner,
        repo,
        path: opts.path,
        ref: branch,
      })
      const data = existing.data as { sha?: string } | unknown[]
      if (
        !Array.isArray(data) &&
        data &&
        typeof data === 'object' &&
        'sha' in data
      )
        sha = (data as { sha: string }).sha
    } catch (err) {
      if (statusOf(err) !== 404) throw err
    }
    const res = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: opts.path,
      branch,
      message: opts.message,
      content: opts.base64, // already base64 — DO NOT re-encode
      sha,
    })
    const commitSha = res.data.commit.sha
    if (!commitSha) throw new Error('GitHub API returned no commit sha')
    return commitSha
  }

  try {
    return { commitSha: await run(auth.token) }
  } catch (err) {
    if (statusOf(err) === 401 && auth.refreshToken) {
      const r = await refresh(auth.refreshToken)
      if (r.access_token) {
        const commitSha = await run(r.access_token)
        return {
          commitSha,
          refreshed: {
            token: r.access_token,
            login: auth.login,
            refreshToken: r.refresh_token ?? auth.refreshToken,
            expiresAt: r.expires_in
              ? Date.now() + r.expires_in * 1000
              : undefined,
          },
        }
      }
    }
    throw err
  }
}
```

(`Octokit`, `Repo`, `repoSlug`, `ghRefresh`, `statusOf`, `AdminAuthError`, `CommitDeps`, `CommitResult`, `AdminGithubToken`, `OctokitLike` all already exist in this file.)

- [ ] **Step 4: Run it (passes)** — `cd apps/web && pnpm test git-write` → PASS. `cd apps/web && pnpm exec tsc --noEmit` → no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/git-write.ts apps/web/lib/admin/git-write.test.ts
git commit -m "feat(admin): engine commitBinary (base64 passthrough for images)"
```

---

## Task 2: media-url (client-safe) + media-io (server)

**Files:** Create `apps/web/lib/admin/media-url.ts` (+ `.test.ts`), `media-io.ts` (+ `.test.ts`).

- [ ] **Step 1: Write the failing media-url test** — `apps/web/lib/admin/media-url.test.ts`:

```ts
/** @jest-environment node */
import { mediaRawUrl } from './media-url'

describe('mediaRawUrl', () => {
  it('maps a /media/ path to the raw GitHub URL', () => {
    expect(mediaRawUrl('/media/capa.png')).toBe(
      'https://raw.githubusercontent.com/PiluVitu/PiluVitu-Dev/main/public/media/capa.png',
    )
  })
  it('returns external URLs unchanged', () => {
    expect(mediaRawUrl('https://aride.com.br/logo.png')).toBe(
      'https://aride.com.br/logo.png',
    )
  })
  it('returns legacy root paths unchanged', () => {
    expect(mediaRawUrl('/profile-2.jpg')).toBe('/profile-2.jpg')
  })
  it('returns empty for empty input', () => {
    expect(mediaRawUrl('')).toBe('')
  })
})
```

- [ ] **Step 2: Run it (fails)** — `cd apps/web && pnpm test media-url` → FAIL.

- [ ] **Step 3: Implement `media-url.ts`** (no server imports — usable from client components):

```ts
/** Client-safe: maps a stored `/media/<file>` path to a raw GitHub URL for immediate
 * preview (before the Vercel redeploy serves it at /media/<file>). External URLs and
 * legacy paths pass through unchanged. The repo slug is public; override via NEXT_PUBLIC_GITHUB_REPO. */
const REPO = process.env.NEXT_PUBLIC_GITHUB_REPO ?? 'PiluVitu/PiluVitu-Dev'

export function mediaRawUrl(value: string): string {
  if (!value) return value
  if (value.startsWith('/media/')) {
    return `https://raw.githubusercontent.com/${REPO}/main/public${value}`
  }
  return value
}
```

- [ ] **Step 4: Run it (passes)** — `cd apps/web && pnpm test media-url` → PASS (4).

- [ ] **Step 5: Write the failing media-io test** — `apps/web/lib/admin/media-io.test.ts`:

```ts
/** @jest-environment node */
import {
  listMedia,
  sanitizeFilename,
  uniqueFilename,
  type ReadDeps,
} from './media-io'

describe('sanitizeFilename', () => {
  it('slugifies the base, lowercases, keeps the extension', () => {
    expect(sanitizeFilename('Capa Husky.PNG')).toBe('capa-husky.png')
    expect(sanitizeFilename('Olá Mundo!.JPEG')).toBe('ola-mundo.jpeg')
  })
})

describe('uniqueFilename', () => {
  it('returns the name when free', () => {
    expect(uniqueFilename('a.png', ['b.png'])).toBe('a.png')
  })
  it('auto-suffixes on collision', () => {
    expect(uniqueFilename('a.png', ['a.png'])).toBe('a-1.png')
    expect(uniqueFilename('a.png', ['a.png', 'a-1.png'])).toBe('a-2.png')
  })
})

describe('listMedia', () => {
  it('lists image files in public/media as { filename, path, size, sha }', async () => {
    const octokit = {
      repos: {
        async getContent() {
          return {
            data: [
              { name: 'capa.png', type: 'file', size: 100, sha: 's1' },
              { name: 'notes.txt', type: 'file', size: 5, sha: 's2' },
            ],
          }
        },
      },
    }
    const deps: ReadDeps = { makeOctokit: () => octokit as never }
    const items = await listMedia('token', deps)
    expect(items).toEqual([
      { filename: 'capa.png', path: '/media/capa.png', size: 100, sha: 's1' },
    ])
  })
  it('returns [] when the folder does not exist', async () => {
    const octokit = {
      repos: {
        async getContent() {
          throw Object.assign(new Error('Not Found'), { status: 404 })
        },
      },
    }
    expect(
      await listMedia('token', { makeOctokit: () => octokit as never }),
    ).toEqual([])
  })
})
```

- [ ] **Step 6: Run it (fails)** — `cd apps/web && pnpm test media-io` → FAIL.

- [ ] **Step 7: Implement `media-io.ts`** (server):

```ts
import { Octokit } from '@octokit/rest'
import { slugify } from './slugify'

export const MEDIA_DIR = 'public/media'
const IMAGE_EXT = /\.(png|jpe?g|webp|svg|gif)$/i

export interface MediaItem {
  filename: string
  path: string // '/media/<file>'
  size: number
  sha: string
}

export interface ReadDeps {
  makeOctokit?: (token: string) => {
    repos: {
      getContent(p: {
        owner: string
        repo: string
        path: string
        ref?: string
      }): Promise<{ data: unknown }>
    }
  }
}

function siteRepo(): { owner: string; repo: string } {
  const raw =
    process.env.KEYSTATIC_GITHUB_REPO?.trim() || 'PiluVitu/PiluVitu-Dev'
  const [owner, repo] = raw.split('/').map((s) => s.trim())
  return { owner, repo }
}
async function makeOctokitDefault(token: string) {
  const { Octokit: O } = await import('@octokit/rest')
  return new O({ auth: token })
}

/** Slugify the base name, lowercase, keep the original extension. */
export function sanitizeFilename(name: string): string {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
  const safeBase = slugify(base) || 'arquivo'
  return ext ? `${safeBase}.${ext}` : safeBase
}

/** If `name` collides with `existing`, append -1, -2, … before the extension. */
export function uniqueFilename(name: string, existing: string[]): string {
  if (!existing.includes(name)) return name
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let n = 1
  while (existing.includes(`${base}-${n}${ext}`)) n++
  return `${base}-${n}${ext}`
}

export async function listMedia(
  token: string,
  deps: ReadDeps = {},
): Promise<MediaItem[]> {
  const make =
    deps.makeOctokit ??
    (makeOctokitDefault as unknown as NonNullable<ReadDeps['makeOctokit']>)
  const octokit = await Promise.resolve(make(token))
  const { owner, repo } = siteRepo()
  let entries: { name: string; type: string; size: number; sha: string }[]
  try {
    const res = await octokit.repos.getContent({
      owner,
      repo,
      path: MEDIA_DIR,
      ref: 'main',
    })
    entries = res.data as {
      name: string
      type: string
      size: number
      sha: string
    }[]
  } catch {
    return []
  }
  return entries
    .filter((e) => e.type === 'file' && IMAGE_EXT.test(e.name))
    .map((e) => ({
      filename: e.name,
      path: `/media/${e.name}`,
      size: e.size,
      sha: e.sha,
    }))
    .sort((a, b) => a.filename.localeCompare(b.filename))
}
```

- [ ] **Step 8: Run it (passes)** — `cd apps/web && pnpm test media-io` → PASS. `cd apps/web && pnpm exec tsc --noEmit` → no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/admin/media-url.ts apps/web/lib/admin/media-url.test.ts apps/web/lib/admin/media-io.ts apps/web/lib/admin/media-io.test.ts
git commit -m "feat(admin): media-url (raw-URL map) + media-io (list/sanitize/unique)"
```

---

# Phase B — Routes + hooks

## Task 3: Media routes (list / upload / delete)

**Files:** Create `apps/web/app/api/admin/media/route.ts`, `apps/web/app/api/admin/media/[name]/route.ts`.

- [ ] **Step 1: `media/route.ts` (GET list + POST upload)**

```ts
import { NextResponse } from 'next/server'
import {
  listMedia,
  sanitizeFilename,
  uniqueFilename,
  MEDIA_DIR,
} from '@/lib/admin/media-io'
import { commitBinary } from '@/lib/admin/git-write'
import {
  getLinkedToken,
  jsonError,
  resealIfRefreshed,
} from '@/lib/admin/content-api'

export const dynamic = 'force-dynamic'

const ALLOWED = /\.(png|jpe?g|webp|svg|gif)$/i
const MAX_BYTES = 4 * 1024 * 1024

export async function GET() {
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  try {
    return NextResponse.json({ items: await listMedia(auth.token) })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao listar a mídia.', {
      detail: String(err),
    })
  }
}

export async function POST(req: Request) {
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  const body = (await req.json().catch(() => null)) as {
    filename?: string
    base64?: string
  } | null
  if (
    !body ||
    typeof body.filename !== 'string' ||
    typeof body.base64 !== 'string'
  ) {
    return jsonError(400, 'validation', 'Envie filename + base64.')
  }
  if (!ALLOWED.test(body.filename)) {
    return jsonError(
      400,
      'invalid_type',
      'Tipo de arquivo não permitido (png/jpg/webp/svg/gif).',
    )
  }
  const bytes = Buffer.from(body.base64, 'base64').length
  if (bytes > MAX_BYTES) {
    return jsonError(400, 'too_large', 'Imagem maior que 4 MB.')
  }
  try {
    const existing = (await listMedia(auth.token)).map((m) => m.filename)
    const name = uniqueFilename(sanitizeFilename(body.filename), existing)
    const result = await commitBinary(auth, {
      repo: 'site',
      path: `${MEDIA_DIR}/${name}`,
      base64: body.base64,
      message: `admin: upload ${name}`,
    })
    await resealIfRefreshed(result)
    return NextResponse.json(
      { path: `/media/${name}`, filename: name },
      { status: 201 },
    )
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao enviar a imagem.', {
      detail: String(err),
    })
  }
}
```

- [ ] **Step 2: `media/[name]/route.ts` (DELETE)**

```ts
import { NextResponse } from 'next/server'
import { deleteFile } from '@/lib/admin/git-write'
import { MEDIA_DIR } from '@/lib/admin/media-io'
import {
  getLinkedToken,
  jsonError,
  resealIfRefreshed,
} from '@/lib/admin/content-api'

export const dynamic = 'force-dynamic'
const NAME_RE = /^[a-z0-9][a-z0-9._-]*\.(png|jpe?g|webp|svg|gif)$/i

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  const { name } = await ctx.params
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  if (!NAME_RE.test(name))
    return jsonError(400, 'validation', 'Nome de arquivo inválido.')
  try {
    const result = await deleteFile(auth, {
      repo: 'site',
      path: `${MEDIA_DIR}/${name}`,
      message: `admin: remove ${name}`,
    })
    await resealIfRefreshed(result)
    return NextResponse.json({ name, deleted: true })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao remover a imagem.', {
      detail: String(err),
    })
  }
}
```

- [ ] **Step 3: Type-check, lint, commit**

```bash
cd apps/web && pnpm exec tsc --noEmit && pnpm lint
git add "apps/web/app/api/admin/media/route.ts" "apps/web/app/api/admin/media/[name]/route.ts"
git commit -m "feat(admin): media routes (list/upload/delete)"
```

---

## Task 4: Media hooks

**Files:** Create `apps/web/hooks/admin/media/use-media-list.ts`, `use-media-mutations.ts`.

- [ ] **Step 1: `use-media-list.ts`**

```ts
'use client'
import { useQuery } from '@tanstack/react-query'
import type { MediaItem } from '@/lib/admin/media-io'

export function useMediaList() {
  return useQuery({
    queryKey: ['admin', 'media'],
    queryFn: async (): Promise<MediaItem[]> => {
      const res = await fetch('/api/admin/media')
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => ({})))?.error?.message ??
            'Falha ao listar',
        )
      return (await res.json()).items
    },
    staleTime: 15_000,
  })
}
```

- [ ] **Step 2: `use-media-mutations.ts`**

```ts
'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'

async function jsonOrThrow(res: Response) {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error?.message ?? 'Falha na operação')
  return body
}

export interface UploadInput {
  filename: string
  base64: string
}

export function useMediaMutations() {
  const qc = useQueryClient()
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['admin', 'media'] })

  const upload = useMutation({
    mutationFn: (
      input: UploadInput,
    ): Promise<{ path: string; filename: string }> =>
      fetch('/api/admin/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then(jsonOrThrow),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (filename: string) =>
      fetch(`/api/admin/media/${filename}`, { method: 'DELETE' }).then(
        jsonOrThrow,
      ),
    onSuccess: invalidate,
  })
  return { upload, remove }
}

/** Reads a File as pure base64 (strips the data: prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
```

- [ ] **Step 3: Type-check, lint, commit**

```bash
cd apps/web && pnpm exec tsc --noEmit && pnpm lint
git add apps/web/hooks/admin/media/
git commit -m "feat(admin): media hooks (list + upload/delete + fileToBase64)"
```

---

# Phase C — UI

## Task 5: MediaCard + MediaGrid

**Files:** Create `apps/web/components/admin/media/media-card.tsx` (+ `.stories`), `media-grid.tsx` (+ `.stories`).

- [ ] **Step 1: `media-card.tsx`** (thumbnail via raw URL + client-decoded dimensions)

```tsx
'use client'

import { useState } from 'react'
import { mediaRawUrl } from '@/lib/admin/media-url'
import type { MediaItem } from '@/lib/admin/media-io'

function kb(bytes: number) {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function MediaCard(props: {
  item: MediaItem
  onSelect?: (item: MediaItem) => void
  onDelete?: (item: MediaItem) => void
}) {
  const [dims, setDims] = useState<string>('')
  const clickable = !!props.onSelect
  return (
    <div className="border-border bg-card flex flex-col overflow-hidden rounded-[var(--radius)] border">
      <button
        type="button"
        disabled={!clickable}
        onClick={() => props.onSelect?.(props.item)}
        className="bg-muted/30 grid aspect-video place-items-center overflow-hidden disabled:cursor-default"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaRawUrl(props.item.path)}
          alt={props.item.filename}
          className="max-h-full max-w-full object-contain"
          onLoad={(e) =>
            setDims(
              `${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`,
            )
          }
        />
      </button>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs">{props.item.filename}</p>
          <p className="text-muted-foreground font-mono text-[10px]">
            {dims} · {kb(props.item.size)}
          </p>
        </div>
        {props.onDelete ? (
          <button
            type="button"
            className="text-warn shrink-0 text-xs"
            onClick={() => props.onDelete?.(props.item)}
          >
            Apagar
          </button>
        ) : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `media-grid.tsx`** (filter chips + grid; reused by page + picker)

```tsx
'use client'

import { useState } from 'react'
import type { MediaItem } from '@/lib/admin/media-io'
import { MediaCard } from './media-card'

const FILTERS = ['Todos', 'PNG', 'JPG', 'WEBP', 'SVG'] as const
function matches(filter: string, name: string) {
  if (filter === 'Todos') return true
  if (filter === 'JPG') return /\.jpe?g$/i.test(name)
  return new RegExp(`\\.${filter.toLowerCase()}$`, 'i').test(name)
}

export function MediaGrid(props: {
  items: MediaItem[]
  onSelect?: (item: MediaItem) => void
  onDelete?: (item: MediaItem) => void
}) {
  const [filter, setFilter] = useState<string>('Todos')
  const shown = props.items.filter((i) => matches(filter, i.filename))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-pill px-3 py-1 font-mono text-xs ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            {f}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma imagem.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {shown.map((item) => (
            <MediaCard
              key={item.filename}
              item={item}
              onSelect={props.onSelect}
              onDelete={props.onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Stories** — `media-card.stories.tsx` (with `onDelete: fn()`; an item `{ filename:'capa.png', path:'/media/capa.png', size: 120000, sha:'s' }`) and `media-grid.stories.tsx` (Default w/ 3 items, Empty). The thumbnails will 404 in Storybook (raw URL of a non-existent file) — that's fine; the card layout + filename + filter chips are what the stories verify.

- [ ] **Step 4: Type-check, lint, commit**

```bash
cd apps/web && pnpm exec tsc --noEmit && pnpm lint
git add apps/web/components/admin/media/media-card.tsx apps/web/components/admin/media/media-card.stories.tsx apps/web/components/admin/media/media-grid.tsx apps/web/components/admin/media/media-grid.stories.tsx
git commit -m "feat(admin): MediaCard + MediaGrid (filter, dims, raw-URL thumbs)"
```

---

## Task 6: MediaPickerDialog + ImageField

**Files:** Create `apps/web/components/admin/media/media-picker-dialog.tsx` (+ `.stories`), `apps/web/components/admin/content/image-field.tsx` (+ `.stories`).

- [ ] **Step 1: `media-picker-dialog.tsx`** (library grid + upload, selection mode)

```tsx
'use client'

import { useRef } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MediaGrid } from './media-grid'
import { useMediaList } from '@/hooks/admin/media/use-media-list'
import {
  useMediaMutations,
  fileToBase64,
} from '@/hooks/admin/media/use-media-mutations'
import type { MediaItem } from '@/lib/admin/media-io'

export function MediaPickerDialog(props: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onPick: (path: string) => void
}) {
  const list = useMediaList()
  const { upload } = useMediaMutations()
  const fileRef = useRef<HTMLInputElement>(null)

  const onFile = async (file: File) => {
    try {
      const base64 = await fileToBase64(file)
      const res = await upload.mutateAsync({ filename: file.name, base64 })
      toast.success('Imagem enviada')
      props.onPick(res.path)
      props.onOpenChange(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Biblioteca de mídia</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Escolha uma imagem ou envie uma nova.
          </p>
          <Button
            size="sm"
            disabled={upload.isPending}
            onClick={() => fileRef.current?.click()}
          >
            {upload.isPending ? 'Enviando…' : 'Enviar arquivo'}
          </Button>
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
        {list.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <MediaGrid
              items={list.data ?? []}
              onSelect={(m: MediaItem) => {
                props.onPick(m.path)
                props.onOpenChange(false)
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: `image-field.tsx`** (text input + preview + Biblioteca button)

```tsx
'use client'

import { useState } from 'react'
import { FieldShell } from './fields'
import { Button } from '@/components/ui/button'
import { mediaRawUrl } from '@/lib/admin/media-url'
import { MediaPickerDialog } from '@/components/admin/media/media-picker-dialog'

export function ImageField(props: {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <FieldShell label={props.label} error={props.error}>
      <div className="flex items-center gap-3">
        <div className="border-border bg-muted/30 grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg">
          {props.value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaRawUrl(props.value)}
              alt=""
              className="max-h-full max-w-full object-contain"
            />
          ) : null}
        </div>
        <input
          className="border-border bg-muted/40 text-foreground placeholder:text-muted-foreground focus:border-primary w-full rounded-lg border px-3 py-2 text-sm outline-none"
          value={props.value}
          placeholder="/media/… ou URL"
          onChange={(e) => props.onChange(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
        >
          Biblioteca
        </Button>
      </div>
      <MediaPickerDialog
        open={open}
        onOpenChange={setOpen}
        onPick={(path) => props.onChange(path)}
      />
    </FieldShell>
  )
}
```

(`FieldShell` is exported from `@/components/admin/content/fields` — confirm; it's used by the other field primitives.)

- [ ] **Step 3: Stories** — `media-picker-dialog.stories.tsx` (open=true, `onPick: fn()`; note the list fetch won't resolve in Storybook → shows skeleton/empty — documents the shell) and `image-field.stories.tsx` (Empty, WithMediaPath `value="/media/capa.png"`, WithExternalUrl `value="https://aride.com.br/logo.png"`, all with `onChange: fn()`).

- [ ] **Step 4: Type-check, lint, commit**

```bash
cd apps/web && pnpm exec tsc --noEmit && pnpm lint
git add apps/web/components/admin/media/media-picker-dialog.tsx apps/web/components/admin/media/media-picker-dialog.stories.tsx apps/web/components/admin/content/image-field.tsx apps/web/components/admin/content/image-field.stories.tsx
git commit -m "feat(admin): MediaPickerDialog + ImageField (picker + manual path)"
```

---

## Task 7: Mídia library page

**Files:** Create `apps/web/app/(admin)/admin/midia/page.tsx` (+ `midia.e2e.ts`).

- [ ] **Step 1: `midia/page.tsx`**

```tsx
'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionHeader } from '@/components/section-header'
import { MediaGrid } from '@/components/admin/media/media-grid'
import { DeleteConfirmDialog } from '@/components/admin/content/delete-confirm-dialog'
import { useMediaList } from '@/hooks/admin/media/use-media-list'
import {
  useMediaMutations,
  fileToBase64,
} from '@/hooks/admin/media/use-media-mutations'
import type { MediaItem } from '@/lib/admin/media-io'

export default function MidiaPage() {
  const list = useMediaList()
  const { upload, remove } = useMediaMutations()
  const fileRef = useRef<HTMLInputElement>(null)
  const [deleting, setDeleting] = useState<MediaItem | null>(null)

  const onFile = async (file: File) => {
    try {
      const base64 = await fileToBase64(file)
      await upload.mutateAsync({ filename: file.name, base64 })
      toast.success('Imagem enviada')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader label="Mídia" count={list.data?.length} />
        <Button
          disabled={upload.isPending}
          onClick={() => fileRef.current?.click()}
        >
          {upload.isPending ? 'Enviando…' : '+ Enviar arquivo'}
        </Button>
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
      {list.isLoading ? (
        <Skeleton className="h-64 w-full rounded-[var(--radius)]" />
      ) : list.isError ? (
        <p className="text-warn text-sm">{(list.error as Error).message}</p>
      ) : (
        <MediaGrid items={list.data ?? []} onDelete={(m) => setDeleting(m)} />
      )}

      <DeleteConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null)
        }}
        itemLabel={`${deleting?.filename ?? ''} (pode estar em uso)`}
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting.filename, {
            onSuccess: () => {
              toast.success('Removida')
              setDeleting(null)
            },
            onError: (e) => toast.error((e as Error).message),
          })
        }}
      />
    </div>
  )
}
```

- [ ] **Step 2: E2E** `apps/web/app/(admin)/admin/midia/midia.e2e.ts`

```ts
import { test, expect, type Page } from '@playwright/test'

function envelope(data: unknown) {
  return JSON.stringify({ ok: true, data, notifications: [] })
}
const admin = {
  id: 1,
  email: 'a@x',
  name: 'Paulo',
  picture: '',
  is_admin: true,
}
const items = [
  { filename: 'capa.png', path: '/media/capa.png', size: 120000, sha: 's1' },
  { filename: 'avatar.jpg', path: '/media/avatar.jpg', size: 50000, sha: 's2' },
]

async function baseMocks(page: Page) {
  await page.route('**/auth/me', (r) =>
    r.fulfill({ contentType: 'application/json', body: envelope(admin) }),
  )
  await page.route('**/votacao/sessions', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: envelope({ sessions: [] }),
    }),
  )
  await page.route('**/api/admin/stats', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        posts: 0,
        drafts: 0,
        published: 0,
        projects: 0,
        careers: 0,
        careersCurrent: 0,
        recentPosts: [],
      }),
    }),
  )
  await page.route('**/api/admin/github/status', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ linked: true, login: 'piluvitu' }),
    }),
  )
  // raw GitHub thumbnails: stub so they don't hit the network / 404 noisily
  await page.route('https://raw.githubusercontent.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('') }),
  )
}

test('lists media and shows the upload control', async ({ page }) => {
  await baseMocks(page)
  await page.route('**/api/admin/media', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items }),
    }),
  )
  await page.goto('/admin/midia')
  await expect(page.getByText('capa.png')).toBeVisible()
  await expect(page.getByText('avatar.jpg')).toBeVisible()
  await expect(
    page.getByRole('button', { name: '+ Enviar arquivo' }),
  ).toBeVisible()
})
```

- [ ] **Step 3: Run E2E, type-check, lint, commit**

```bash
cd apps/web && pnpm test:e2e midia.e2e.ts
cd apps/web && pnpm exec tsc --noEmit && pnpm lint
git add "apps/web/app/(admin)/admin/midia"
git commit -m "feat(admin): Mídia library page + E2E"
```

---

# Phase D — Wiring + docs

## Task 8: Wire `<ImageField>` into the forms

**Files:** Modify `apps/web/components/admin/content/{project-form,carreira-form,social-form,profile-form}.tsx` and `apps/web/components/admin/posts/post-frontmatter-form.tsx`.

For EACH form: add `import { ImageField } from '@/components/admin/content/image-field'`, and replace the `TextField` used for the image field(s) with `ImageField` (same `label`/`value`/`onChange`/`error` props — `ImageField` has the identical prop shape). Image fields per form:

- [ ] **Step 1: `project-form.tsx`** — replace the `TextField` for `projectLogo` ("Logo (path)") and for `image` ("Imagem de capa (path)") with `ImageField` (keep the same label/value/onChange).
- [ ] **Step 2: `carreira-form.tsx`** — replace the `TextField` for `image` ("Logo (URL)") with `ImageField`.
- [ ] **Step 3: `social-form.tsx`** — replace the `TextField` for `image` ("Imagem (path)", shown when `iconMode==='image'`) with `ImageField`.
- [ ] **Step 4: `profile-form.tsx`** — replace the `TextField` for `avatarSrc` ("Avatar (path)") with `ImageField`.
- [ ] **Step 5: `post-frontmatter-form.tsx`** — replace the `TextField` for `coverImage` ("Imagem de capa (path)") with `ImageField`.

For each: leave all OTHER fields as `TextField`. After all five:

- [ ] **Step 6: Type-check, lint, commit**

```bash
cd apps/web && pnpm exec tsc --noEmit && pnpm lint
git add apps/web/components/admin/content/project-form.tsx apps/web/components/admin/content/carreira-form.tsx apps/web/components/admin/content/social-form.tsx apps/web/components/admin/content/profile-form.tsx apps/web/components/admin/posts/post-frontmatter-form.tsx
git commit -m "feat(admin): wire ImageField into project/carreira/social/profile/post forms"
```

> Note: `ImageField` renders a `MediaPickerDialog` (which uses `useMediaList`/`useMediaMutations`) — these are client hooks; all five forms are already `'use client'`, so this is safe. Verify the existing per-surface E2E (projetos/carreira/socials/perfil/posts) still pass after the swap: `cd apps/web && pnpm test:e2e projetos carreira socials perfil editor` — the image fields are now `ImageField` (still have a text input with the same label, so `getByLabel` selectors keep working). If an E2E breaks on the image field, report.

---

## Task 9: Sidebar + breadcrumb

**Files:** Modify `apps/web/components/admin/admin-sidebar.tsx`, `apps/web/app/(admin)/admin/layout.tsx`.

- [ ] **Step 1:** In `admin-sidebar.tsx`, the **Site** group's "Mídia" item — set its `href` to `/admin/midia` (it may currently be a placeholder like `/admin` or `#`). Read the file to confirm the current href and icon (`faImage`).
- [ ] **Step 2:** In `layout.tsx`'s `CRUMB` map, add `'/admin/midia': ['Site', 'Mídia']`.
- [ ] **Step 3: Type-check, lint, commit**

```bash
cd apps/web && pnpm exec tsc --noEmit && pnpm lint
git add apps/web/components/admin/admin-sidebar.tsx "apps/web/app/(admin)/admin/layout.tsx"
git commit -m "feat(admin): sidebar Mídia → /admin/midia + breadcrumb"
```

---

## Task 10: Docs + full verification

**Files:** Modify `CLAUDE.md`.

- [ ] **Step 1:** In the **`### Admin unificado (/admin)`** section of root `CLAUDE.md`, add:

```markdown
- **Slice ④ (Mídia):** `/admin/midia` — biblioteca de imagens (grid + upload + apagar) que grava binário em `public/media/` do repo do site via a engine `commitBinary` (`lib/admin/git-write.ts`, base64 passthrough — NÃO re-encoda). IO `lib/admin/media-io.ts` (`listMedia`/`sanitizeFilename`/`uniqueFilename`); `lib/admin/media-url.ts` `mediaRawUrl()` (client-safe) mapeia `/media/*` → raw GitHub URL pro preview imediato (antes do redeploy; o valor salvo é `/media/<file>`, servido após deploy). Rotas `app/api/admin/media/*` (≤4 MB, png/jpg/webp/svg/gif). `<ImageField>` (`components/admin/content/image-field.tsx`, picker `MediaPickerDialog` + path/URL manual) substitui o input de texto nos campos de imagem de projeto/carreira/social/perfil/post. Upload commita em `main` → redeploy serve em `/media/<file>`. Sem processamento de imagem (sobe como está).
```

- [ ] **Step 2: Full verification (capture real output)**

```bash
cd apps/web && pnpm prettier:check   # fix new slice-④ files only if flagged
cd apps/web && pnpm lint             # clean
cd apps/web && pnpm test             # all Jest green (git-write commitBinary, media-url, media-io + existing)
cd apps/web && pnpm build:ci         # MUST succeed; confirm /admin/midia + /api/admin/media* + /api/admin/media/[name] build, and the existing admin/public routes still build
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(admin): CLAUDE.md for slice ④ Mídia"
```

---

## Self-review

**Spec coverage:**

- §3.1 `commitBinary` → Task 1. ✅
- §3.2 media-io (listMedia/sanitize/unique) + `mediaRawUrl` (client-safe split) → Task 2. ✅
- §3.3 publish/preview model (value=`/media/<file>`, preview=raw URL) → Tasks 2 (mediaRawUrl), 5/6 (cards/field use it). ✅
- §4 routes (list/upload/delete + validation + path-traversal guard) → Task 3. ✅
- §5.1 library page → Task 7; §5.2 MediaGrid/MediaCard → Task 5; §5.3 ImageField/MediaPickerDialog → Task 6; §5.4 wiring 5 forms → Task 8; §5.5 sidebar → Task 9. ✅
- §6 testing (Jest/Storybook/Playwright) → Tasks 1,2 (Jest), 5,6 (Storybook), 7 (Playwright) + Task 8 re-runs existing form E2E. ✅
- §7 risks / §8 acceptance → Task 10 verification + per-task. ✅

**Placeholder scan:** Tasks 5/6 stories and Task 8 form edits are described as "replace the TextField for field X with ImageField (same props)" / "story with these args" rather than re-pasting each form's full source — the `ImageField` prop shape is identical to `TextField`, so the swap is mechanical and unambiguous, and the component code is fully given. Acceptable.

**Type consistency:** `MediaItem` (media-io) used by hooks (4), MediaCard/Grid (5), page (7), picker (6). `commitBinary(auth, {repo,path,base64,message}, deps?)` consistent (1 def ↔ 3 route call). `mediaRawUrl` (media-url) used by MediaCard (5) + ImageField (6). `useMediaList`/`useMediaMutations`/`fileToBase64`/`UploadInput` consistent (4 ↔ 6,7). `ImageField` prop shape == `TextField` (label/value/onChange/error) so the Task 8 swaps are drop-in. ✅
