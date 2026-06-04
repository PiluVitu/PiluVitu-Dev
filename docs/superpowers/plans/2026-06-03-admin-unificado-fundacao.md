# Admin Unificado — Fundação (slice ①) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared chassis of a unified DS V2 admin at `/admin`: Google-session gate, "Conectar GitHub" OAuth + sealed-token cookie, a generic `commitFile()` git-write engine, and the admin shell (sidebar + top bar + dashboard with stat cards).

**Architecture:** A new `app/(admin)` route group (own providers, no site nav). UI gate is client-side via the existing `useCurrentUser()` (`is_admin`) — same pattern as `/votacao/admin`. The real write boundary is GitHub's own permissions: every future write uses the linked user's GitHub token (reusing the Keystatic GitHub App), sealed into an httpOnly AES-256-GCM cookie. The Go API is **not touched**.

**Tech Stack:** Next.js 16 App Router (Route Handlers, `cookies()`), Node `crypto` (AES-256-GCM, zero new deps), `@octokit/rest` (already a dep), TanStack Query, Tailwind/DS V2 tokens, FontAwesome, Jest (jsdom), Storybook 10 (`@storybook/nextjs`), Playwright.

**Key facts (verified in repo):**

- `useCurrentUser()` → `@/hooks/votacao/use-current-user`; `User` = `{ id, email, name, picture, is_admin }`.
- `votacaoApi.listSessions()` → `{ sessions: VotingSession[] }`, `VotingSession.Status: 'open' | 'closed'`.
- Readers: `getProjects()`, `getCarreiras()` (`Carreira.current: boolean`) in `@/lib/site-content`; blog in `@/lib/blog-posts` (`BlogPost = { slug, title, readingTimeMinutes, draft, publishedAt, ... }`).
- Providers: `@/components/theme-provider` (`ThemeProvider`), `@/utils/providers/react-query-provider` (`ReactQueryProvider`), `@/components/ui/sonner` (`Toaster`). Root `app/layout.tsx` only sets `<html>/<body>` + fonts (no providers).
- `ModeToggle` → `@/components/mode-toggle`. Tokens: `shadow-ds`, `rounded-pill`, `bg-accent-soft`, `border-border`, `bg-card`, `text-primary`, `text-muted-foreground`.
- Jest: jsdom env, `testMatch **/*.test.ts(x)`, alias `@/*` → `apps/web`. Run from `apps/web`. Playwright: `**/*.e2e.ts`, baseURL `http://localhost:3333`, host-agnostic `page.route('**/...')` mocks.
- Env reused: `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`, `KEYSTATIC_GITHUB_REPO` (default `PiluVitu/PiluVitu-Dev`), `BLOG_REPO_OWNER`/`BLOG_REPO_NAME`, `NEXT_PUBLIC_API_URL`. New: `ADMIN_TOKEN_SECRET`.

**Conventions:** All commands run inside the devcontainer. Jest/lint/build from `apps/web`. Commit after each task.

---

## File structure (created/modified in this slice)

```
lib/admin/token-cookie.ts            seal/open AES-256-GCM + cookie name        (Task 1)
lib/admin/token-cookie.test.ts                                                  (Task 1)
lib/admin/github-oauth.ts            authorizeUrl/exchange/refresh/login        (Task 2)
lib/admin/github-oauth.test.ts                                                  (Task 2)
lib/admin/git-write.ts               commitFile() engine                        (Task 3)
lib/admin/git-write.test.ts                                                     (Task 3)
lib/blog-posts.ts                    + export getAllBlogPosts()  (MODIFY)       (Task 4)
app/api/admin/stats/route.ts         GET counts + recent posts                  (Task 5)
app/api/admin/github/login/route.ts  GET → redirect to GitHub authorize          (Task 6)
app/api/admin/github/callback/route.ts GET → exchange → seal cookie              (Task 6)
app/api/admin/github/status/route.ts GET → { linked, login }                    (Task 6)
app/api/admin/github/unlink/route.ts POST → clear cookie                        (Task 6)
components/admin/stat-card.tsx (+ .stories)                                     (Task 7)
components/admin/admin-sidebar.tsx (+ .stories)                                 (Task 8)
components/admin/admin-top-bar.tsx (+ .stories)                                 (Task 9)
components/admin/github-link-banner.tsx (+ .stories)                            (Task 10)
hooks/admin/use-github-link.ts                                                  (Task 10)
hooks/admin/use-admin-stats.ts                                                  (Task 13)
app/(admin)/layout.tsx               providers, no site nav                     (Task 11)
app/(admin)/admin/layout.tsx         shell: gate + sidebar + top bar            (Task 12)
app/(admin)/admin/page.tsx           dashboard                                  (Task 13)
app/(admin)/admin/admin.e2e.ts       Playwright                                 (Task 14)
.env.example, CLAUDE.md              docs + env                                 (Task 15)
```

---

## Task 1: Sealed-token cookie module

**Files:**

- Create: `apps/web/lib/admin/token-cookie.ts`
- Test: `apps/web/lib/admin/token-cookie.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/lib/admin/token-cookie.test.ts`:

```ts
/** @jest-environment node */
import { sealToken, openToken, ADMIN_GH_COOKIE } from './token-cookie'

const PAYLOAD = {
  token: 'gho_abc123',
  login: 'piluvitu',
  refreshToken: 'r1',
  expiresAt: 123,
}

beforeAll(() => {
  process.env.ADMIN_TOKEN_SECRET = 'test-secret-please-change-0123456789'
})

describe('token-cookie', () => {
  it('round-trips a payload', () => {
    const sealed = sealToken(PAYLOAD)
    expect(typeof sealed).toBe('string')
    expect(sealed).not.toContain('gho_abc123') // ciphertext, not plaintext
    expect(openToken(sealed)).toEqual(PAYLOAD)
  })

  it('returns null for a tampered cookie', () => {
    const sealed = sealToken(PAYLOAD)
    const tampered =
      sealed.slice(0, -2) +
      (sealed.endsWith('A') ? 'B' : 'A') +
      sealed.slice(-1)
    expect(openToken(tampered)).toBeNull()
  })

  it('returns null for garbage', () => {
    expect(openToken('not-base64url!!')).toBeNull()
    expect(openToken('')).toBeNull()
  })

  it('throws when the secret is missing', () => {
    const prev = process.env.ADMIN_TOKEN_SECRET
    delete process.env.ADMIN_TOKEN_SECRET
    expect(() => sealToken(PAYLOAD)).toThrow(/ADMIN_TOKEN_SECRET/)
    process.env.ADMIN_TOKEN_SECRET = prev
  })

  it('exposes the cookie name', () => {
    expect(ADMIN_GH_COOKIE).toBe('piluvitu_admin_gh')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test token-cookie`
Expected: FAIL — `Cannot find module './token-cookie'`.

- [ ] **Step 3: Write the implementation**

`apps/web/lib/admin/token-cookie.ts`:

```ts
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto'

export const ADMIN_GH_COOKIE = 'piluvitu_admin_gh'

export interface AdminGithubToken {
  token: string
  login: string
  refreshToken?: string
  /** epoch ms when `token` expires (GitHub App expiring tokens); absent if non-expiring. */
  expiresAt?: number
}

const ALGO = 'aes-256-gcm'

function key(): Buffer {
  const secret = process.env.ADMIN_TOKEN_SECRET
  if (!secret) throw new Error('ADMIN_TOKEN_SECRET is not set')
  // Derive a fixed 32-byte key from the secret of any length.
  return createHash('sha256').update(secret).digest()
}

/** Encrypts the payload into a URL-safe cookie value: base64url(iv ‖ tag ‖ ciphertext). */
export function sealToken(payload: AdminGithubToken): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key(), iv)
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url')
}

/** Decrypts a sealed cookie. Returns null on any tamper/parse/auth failure. */
export function openToken(sealed: string): AdminGithubToken | null {
  try {
    const raw = Buffer.from(sealed, 'base64url')
    if (raw.length < 28) return null
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const ciphertext = raw.subarray(28)
    const decipher = createDecipheriv(ALGO, key(), iv)
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ])
    return JSON.parse(plaintext.toString('utf8')) as AdminGithubToken
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm test token-cookie`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/token-cookie.ts apps/web/lib/admin/token-cookie.test.ts
git commit -m "feat(admin): sealed GitHub token cookie (AES-256-GCM)"
```

---

## Task 2: GitHub App OAuth helpers

**Files:**

- Create: `apps/web/lib/admin/github-oauth.ts`
- Test: `apps/web/lib/admin/github-oauth.test.ts`

Pure URL building is unit-tested; the network wrappers (`exchangeCode`, `refreshToken`, `fetchGithubLogin`) are thin and exercised by the E2E + manual verification (Task 6/15).

- [ ] **Step 1: Write the failing test**

`apps/web/lib/admin/github-oauth.test.ts`:

```ts
/** @jest-environment node */
import { authorizeUrl } from './github-oauth'

describe('authorizeUrl', () => {
  beforeAll(() => {
    process.env.KEYSTATIC_GITHUB_CLIENT_ID = 'Iv1.testclientid'
  })

  it('builds a GitHub authorize URL with client_id, state and redirect_uri', () => {
    const url = new URL(
      authorizeUrl(
        'xyz-state',
        'https://piluvitu.com.br/api/admin/github/callback',
      ),
    )
    expect(url.origin + url.pathname).toBe(
      'https://github.com/login/oauth/authorize',
    )
    expect(url.searchParams.get('client_id')).toBe('Iv1.testclientid')
    expect(url.searchParams.get('state')).toBe('xyz-state')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://piluvitu.com.br/api/admin/github/callback',
    )
  })

  it('throws if the client id is missing', () => {
    const prev = process.env.KEYSTATIC_GITHUB_CLIENT_ID
    delete process.env.KEYSTATIC_GITHUB_CLIENT_ID
    expect(() => authorizeUrl('s', 'https://x/cb')).toThrow(
      /KEYSTATIC_GITHUB_CLIENT_ID/,
    )
    process.env.KEYSTATIC_GITHUB_CLIENT_ID = prev
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test github-oauth`
Expected: FAIL — `Cannot find module './github-oauth'`.

- [ ] **Step 3: Write the implementation**

`apps/web/lib/admin/github-oauth.ts`:

```ts
const GH_AUTHORIZE = 'https://github.com/login/oauth/authorize'
const GH_TOKEN = 'https://github.com/login/oauth/access_token'

export interface GithubTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  error?: string
  error_description?: string
}

function clientId(): string {
  const id = process.env.KEYSTATIC_GITHUB_CLIENT_ID
  if (!id) throw new Error('KEYSTATIC_GITHUB_CLIENT_ID is not set')
  return id
}

function clientSecret(): string {
  const s = process.env.KEYSTATIC_GITHUB_CLIENT_SECRET
  if (!s) throw new Error('KEYSTATIC_GITHUB_CLIENT_SECRET is not set')
  return s
}

/** Builds the GitHub App user-to-server authorize URL. */
export function authorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    state,
  })
  return `${GH_AUTHORIZE}?${params.toString()}`
}

async function postToken(
  body: Record<string, string>,
): Promise<GithubTokenResponse> {
  const res = await fetch(GH_TOKEN, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await res.json()) as GithubTokenResponse
}

/** Exchanges an authorization code for a user access token. */
export function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<GithubTokenResponse> {
  return postToken({
    client_id: clientId(),
    client_secret: clientSecret(),
    code,
    redirect_uri: redirectUri,
  })
}

/** Refreshes an expiring user token (only when the App issues refresh tokens). */
export function refreshToken(refresh: string): Promise<GithubTokenResponse> {
  return postToken({
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: 'refresh_token',
    refresh_token: refresh,
  })
}

/** Reads the authenticated user's GitHub login (for display + cookie). */
export async function fetchGithubLogin(token: string): Promise<string> {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  })
  if (!res.ok) throw new Error(`GitHub /user failed: ${res.status}`)
  const data = (await res.json()) as { login: string }
  return data.login
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm test github-oauth`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/github-oauth.ts apps/web/lib/admin/github-oauth.test.ts
git commit -m "feat(admin): GitHub App OAuth helpers (authorize/exchange/refresh)"
```

---

## Task 3: `commitFile()` git-write engine

**Files:**

- Create: `apps/web/lib/admin/git-write.ts`
- Test: `apps/web/lib/admin/git-write.test.ts`

The engine is injectable (`makeOctokit`, `refresh`) so tests need no network. It returns `{ commitSha, refreshed? }`; if a 401 triggered a refresh, `refreshed` carries the new token so a future route handler can re-seal the cookie.

- [ ] **Step 1: Write the failing test**

`apps/web/lib/admin/git-write.test.ts`:

```ts
/** @jest-environment node */
import { commitFile, AdminAuthError, type OctokitLike } from './git-write'

beforeAll(() => {
  process.env.KEYSTATIC_GITHUB_REPO = 'PiluVitu/PiluVitu-Dev'
  process.env.BLOG_REPO_OWNER = 'PiluVitu'
  process.env.BLOG_REPO_NAME = 'piluvitu-blog'
})

function fakeOctokit(over: Partial<OctokitLike['repos']> = {}): {
  octokit: OctokitLike
  calls: { create: any[]; get: any[] }
} {
  const calls = { create: [] as any[], get: [] as any[] }
  const octokit: OctokitLike = {
    repos: {
      async getContent(p) {
        calls.get.push(p)
        return { data: { sha: 'existing-sha' } }
      },
      async createOrUpdateFileContents(p) {
        calls.create.push(p)
        return { data: { commit: { sha: 'new-commit' } } }
      },
      ...over,
    },
  }
  return { octokit, calls }
}

describe('commitFile', () => {
  it('throws AdminAuthError when not linked', async () => {
    await expect(
      commitFile(null, {
        repo: 'site',
        path: 'a.yaml',
        content: 'x',
        message: 'm',
      }),
    ).rejects.toBeInstanceOf(AdminAuthError)
  })

  it('updates an existing file with its sha (site repo)', async () => {
    const { octokit, calls } = fakeOctokit()
    const res = await commitFile(
      { token: 't', login: 'me' },
      {
        repo: 'site',
        path: 'content/x.yaml',
        content: 'hello',
        message: 'msg',
      },
      { makeOctokit: () => octokit },
    )
    expect(res.commitSha).toBe('new-commit')
    expect(calls.get[0]).toMatchObject({
      owner: 'PiluVitu',
      repo: 'PiluVitu-Dev',
      path: 'content/x.yaml',
    })
    expect(calls.create[0]).toMatchObject({
      sha: 'existing-sha',
      branch: 'main',
    })
    expect(
      Buffer.from(calls.create[0].content, 'base64').toString('utf8'),
    ).toBe('hello')
  })

  it('creates a new file (404 on getContent → no sha) in the blog repo', async () => {
    const { octokit, calls } = fakeOctokit({
      async getContent() {
        throw Object.assign(new Error('Not Found'), { status: 404 })
      },
    })
    await commitFile(
      { token: 't', login: 'me' },
      {
        repo: 'blog',
        path: 'content/posts/new.mdx',
        content: '# hi',
        message: 'msg',
      },
      { makeOctokit: () => octokit },
    )
    expect(calls.create[0]).toMatchObject({
      owner: 'PiluVitu',
      repo: 'piluvitu-blog',
      sha: undefined,
    })
  })

  it('refreshes once on 401 and retries, returning the refreshed token', async () => {
    let firstCall = true
    const octokit: OctokitLike = {
      repos: {
        async getContent() {
          return { data: { sha: 's' } }
        },
        async createOrUpdateFileContents() {
          if (firstCall) {
            firstCall = false
            throw Object.assign(new Error('Bad credentials'), { status: 401 })
          }
          return { data: { commit: { sha: 'after-refresh' } } }
        },
      },
    }
    const res = await commitFile(
      { token: 'old', login: 'me', refreshToken: 'r' },
      { repo: 'site', path: 'x.yaml', content: 'y', message: 'm' },
      {
        makeOctokit: () => octokit,
        refresh: async () => ({
          access_token: 'new',
          refresh_token: 'r2',
          expires_in: 28800,
        }),
      },
    )
    expect(res.commitSha).toBe('after-refresh')
    expect(res.refreshed?.token).toBe('new')
    expect(res.refreshed?.login).toBe('me')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test git-write`
Expected: FAIL — `Cannot find module './git-write'`.

- [ ] **Step 3: Write the implementation**

`apps/web/lib/admin/git-write.ts`:

```ts
import { Octokit } from '@octokit/rest'
import { refreshToken as ghRefresh } from './github-oauth'
import type { AdminGithubToken } from './token-cookie'

export class AdminAuthError extends Error {
  constructor(message = 'GitHub not linked') {
    super(message)
    this.name = 'AdminAuthError'
  }
}

export type Repo = 'site' | 'blog'

/** Minimal structural subset of Octokit used here — keeps tests free of the real client. */
export interface OctokitLike {
  repos: {
    getContent(params: {
      owner: string
      repo: string
      path: string
      ref?: string
    }): Promise<{ data: unknown }>
    createOrUpdateFileContents(params: {
      owner: string
      repo: string
      path: string
      branch?: string
      message: string
      content: string
      sha?: string
    }): Promise<{ data: { commit: { sha?: string } } }>
  }
}

export interface CommitFileOptions {
  repo: Repo
  path: string
  content: string
  message: string
  branch?: string
}

export interface CommitDeps {
  makeOctokit?: (token: string) => OctokitLike
  refresh?: (refreshToken: string) => Promise<{
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }>
}

export interface CommitResult {
  commitSha: string
  /** Present only when a 401 triggered a token refresh; caller should re-seal the cookie. */
  refreshed?: AdminGithubToken
}

function repoSlug(repo: Repo): { owner: string; repo: string } {
  if (repo === 'site') {
    const raw =
      process.env.KEYSTATIC_GITHUB_REPO?.trim() || 'PiluVitu/PiluVitu-Dev'
    const [owner, name] = raw.split('/').map((s) => s.trim())
    return { owner, repo: name }
  }
  return {
    owner: process.env.BLOG_REPO_OWNER ?? 'PiluVitu',
    repo: process.env.BLOG_REPO_NAME ?? 'piluvitu-blog',
  }
}

function statusOf(err: unknown): number | undefined {
  return (err as { status?: number } | null)?.status
}

export async function commitFile(
  auth: AdminGithubToken | null,
  opts: CommitFileOptions,
  deps: CommitDeps = {},
): Promise<CommitResult> {
  if (!auth) throw new AdminAuthError()

  const makeOctokit =
    deps.makeOctokit ??
    ((token: string) => new Octokit({ auth: token }) as unknown as OctokitLike)
  const refresh = deps.refresh ?? ghRefresh
  const { owner, repo } = repoSlug(opts.repo)
  const branch = opts.branch ?? 'main'

  const runWith = async (token: string): Promise<string> => {
    const octokit = makeOctokit(token)
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
      ) {
        sha = (data as { sha: string }).sha
      }
    } catch (err) {
      if (statusOf(err) !== 404) throw err // 404 = file doesn't exist yet → create
    }
    const res = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: opts.path,
      branch,
      message: opts.message,
      content: Buffer.from(opts.content, 'utf8').toString('base64'),
      sha,
    })
    return res.data.commit.sha ?? ''
  }

  try {
    return { commitSha: await runWith(auth.token) }
  } catch (err) {
    if (statusOf(err) === 401 && auth.refreshToken) {
      const r = await refresh(auth.refreshToken)
      if (r.access_token) {
        const commitSha = await runWith(r.access_token)
        const refreshed: AdminGithubToken = {
          token: r.access_token,
          login: auth.login,
          refreshToken: r.refresh_token ?? auth.refreshToken,
          expiresAt: r.expires_in
            ? Date.now() + r.expires_in * 1000
            : undefined,
        }
        return { commitSha, refreshed }
      }
    }
    throw err
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm test git-write`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/git-write.ts apps/web/lib/admin/git-write.test.ts
git commit -m "feat(admin): commitFile() git-write engine (Octokit, refresh retry)"
```

---

## Task 4: Export `getAllBlogPosts()` (drafts included)

**Files:**

- Modify: `apps/web/lib/blog-posts.ts`

The dashboard counts need drafts; `getBlogPosts()` filters them. Expose the internal all-posts cache.

- [ ] **Step 1: Add the export**

In `apps/web/lib/blog-posts.ts`, immediately after the `getBlogPostSlugs` function, add:

```ts
/** All posts INCLUDING drafts — for admin counts/listing (never expose publicly). */
export async function getAllBlogPosts(): Promise<BlogPost[]> {
  return _cachedFetchAll()
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/blog-posts.ts
git commit -m "feat(admin): export getAllBlogPosts() including drafts"
```

---

## Task 5: `/api/admin/stats` route

**Files:**

- Create: `apps/web/app/api/admin/stats/route.ts`

- [ ] **Step 1: Write the route**

`apps/web/app/api/admin/stats/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getAllBlogPosts } from '@/lib/blog-posts'
import { getProjects, getCarreiras } from '@/lib/site-content'

export interface AdminStats {
  posts: number
  drafts: number
  published: number
  projects: number
  careers: number
  careersCurrent: number
  recentPosts: Array<{
    slug: string
    title: string
    draft: boolean
    readingTimeMinutes: number
    publishedAt: string
  }>
}

export async function GET() {
  const [posts, projects, careers] = await Promise.all([
    getAllBlogPosts(),
    getProjects(),
    getCarreiras(),
  ])
  const drafts = posts.filter((p) => p.draft).length
  const body: AdminStats = {
    posts: posts.length,
    drafts,
    published: posts.length - drafts,
    projects: projects.length,
    careers: careers.length,
    careersCurrent: careers.filter((c) => c.current).length,
    recentPosts: posts.slice(0, 8).map((p) => ({
      slug: p.slug,
      title: p.title,
      draft: p.draft,
      readingTimeMinutes: p.readingTimeMinutes,
      publishedAt: p.publishedAt,
    })),
  }
  return NextResponse.json(body)
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors. (If `BlogPost` lacks `publishedAt`/`readingTimeMinutes`, fix the field names to match `lib/blog-posts.ts` — they are confirmed present.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/admin/stats/route.ts
git commit -m "feat(admin): /api/admin/stats route (counts + recent posts)"
```

---

## Task 6: GitHub link Route Handlers (login/callback/status/unlink)

**Files:**

- Create: `apps/web/app/api/admin/github/login/route.ts`
- Create: `apps/web/app/api/admin/github/callback/route.ts`
- Create: `apps/web/app/api/admin/github/status/route.ts`
- Create: `apps/web/app/api/admin/github/unlink/route.ts`

- [ ] **Step 1: login route**

`apps/web/app/api/admin/github/login/route.ts`:

```ts
import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { authorizeUrl } from '@/lib/admin/github-oauth'

const STATE_COOKIE = 'piluvitu_admin_oauth_state'

export async function GET(req: Request) {
  const origin = new URL(req.url).origin
  const redirectUri = `${origin}/api/admin/github/callback`
  const state = randomBytes(16).toString('hex')
  const jar = await cookies()
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return NextResponse.redirect(authorizeUrl(state, redirectUri))
}
```

- [ ] **Step 2: callback route**

`apps/web/app/api/admin/github/callback/route.ts`:

```ts
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { exchangeCode, fetchGithubLogin } from '@/lib/admin/github-oauth'
import { sealToken, ADMIN_GH_COOKIE } from '@/lib/admin/token-cookie'

const STATE_COOKIE = 'piluvitu_admin_oauth_state'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const jar = await cookies()
  const expected = jar.get(STATE_COOKIE)?.value

  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(`${url.origin}/admin?gh=error`)
  }

  const redirectUri = `${url.origin}/api/admin/github/callback`
  const tok = await exchangeCode(code, redirectUri)
  if (!tok.access_token) {
    return NextResponse.redirect(`${url.origin}/admin?gh=error`)
  }

  const login = await fetchGithubLogin(tok.access_token)
  const sealed = sealToken({
    token: tok.access_token,
    login,
    refreshToken: tok.refresh_token,
    expiresAt: tok.expires_in ? Date.now() + tok.expires_in * 1000 : undefined,
  })

  jar.delete(STATE_COOKIE)
  jar.set(ADMIN_GH_COOKIE, sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 180, // 180 days
  })
  return NextResponse.redirect(`${url.origin}/admin?gh=linked`)
}
```

- [ ] **Step 3: status route**

`apps/web/app/api/admin/github/status/route.ts`:

```ts
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { openToken, ADMIN_GH_COOKIE } from '@/lib/admin/token-cookie'

export async function GET() {
  const jar = await cookies()
  const sealed = jar.get(ADMIN_GH_COOKIE)?.value
  const tok = sealed ? openToken(sealed) : null
  return NextResponse.json({ linked: !!tok, login: tok?.login ?? null })
}
```

- [ ] **Step 4: unlink route**

`apps/web/app/api/admin/github/unlink/route.ts`:

```ts
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ADMIN_GH_COOKIE } from '@/lib/admin/token-cookie'

export async function POST() {
  const jar = await cookies()
  jar.delete(ADMIN_GH_COOKIE)
  return NextResponse.json({ linked: false })
}
```

- [ ] **Step 5: Type-check**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/admin/github
git commit -m "feat(admin): GitHub link route handlers (login/callback/status/unlink)"
```

---

## Task 7: `StatCard` component + story

**Files:**

- Create: `apps/web/components/admin/stat-card.tsx`
- Create: `apps/web/components/admin/stat-card.stories.tsx`

- [ ] **Step 1: Component**

`apps/web/components/admin/stat-card.tsx`:

```tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: number | string
  hint?: ReactNode
  className?: string
}

export function StatCard({ label, value, hint, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'border-border bg-card shadow-ds rounded-[var(--radius)] border p-6',
        className,
      )}
    >
      <p className="text-muted-foreground font-mono text-xs font-semibold tracking-[0.18em] uppercase">
        {label}
      </p>
      <p className="mt-3 text-4xl font-semibold tabular-nums">{value}</p>
      {hint ? (
        <p className="text-muted-foreground mt-2 text-sm">{hint}</p>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 2: Story**

`apps/web/components/admin/stat-card.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { StatCard } from './stat-card'

const meta: Meta<typeof StatCard> = {
  title: 'Admin/StatCard',
  component: StatCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof StatCard>

export const Posts: Story = {
  args: {
    label: 'Posts',
    value: 6,
    hint: (
      <>
        <strong className="text-foreground">5</strong> publicados ·{' '}
        <strong className="text-foreground">1</strong> rascunho
      </>
    ),
  },
}

export const Simple: Story = {
  args: { label: 'Projetos', value: 1, hint: '1 publicado' },
}
```

- [ ] **Step 3: Verify in Storybook**

Run: `cd apps/web && pnpm storybook` → open `Admin/StatCard`. Expected: card with mono uppercase label, large number, muted hint. Stop Storybook when satisfied.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/admin/stat-card.tsx apps/web/components/admin/stat-card.stories.tsx
git commit -m "feat(admin): StatCard component + story"
```

---

## Task 8: `AdminSidebar` component + story

**Files:**

- Create: `apps/web/components/admin/admin-sidebar.tsx`
- Create: `apps/web/components/admin/admin-sidebar.stories.tsx`

- [ ] **Step 1: Component**

`apps/web/components/admin/admin-sidebar.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faNewspaper,
  faDiagramProject,
  faBriefcase,
  faUser,
  faImage,
  faSquareCheck,
  faCubes,
  faUpRightFromSquare,
  faRightFromBracket,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons'
import { cn } from '@/lib/utils'

export interface SidebarCounts {
  posts?: number
  projects?: number
  careers?: number
  sessions?: number
}

interface NavItem {
  label: string
  href: string
  icon: IconDefinition
  countKey?: keyof SidebarCounts
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const GROUPS: NavGroup[] = [
  {
    title: 'Coleções',
    items: [
      { label: 'Posts', href: '/admin', icon: faNewspaper, countKey: 'posts' },
      {
        label: 'Projetos',
        href: '/admin/projetos',
        icon: faDiagramProject,
        countKey: 'projects',
      },
      {
        label: 'Carreira',
        href: '/admin/carreira',
        icon: faBriefcase,
        countKey: 'careers',
      },
    ],
  },
  {
    title: 'Site',
    items: [
      { label: 'Perfil & bio', href: '/admin/perfil', icon: faUser },
      { label: 'Mídia', href: '/admin/midia', icon: faImage },
    ],
  },
  {
    title: 'Votação',
    items: [
      {
        label: 'Sessões',
        href: '/admin/sessoes',
        icon: faSquareCheck,
        countKey: 'sessions',
      },
    ],
  },
]

export function AdminSidebar({
  counts = {},
  onLogout,
}: {
  counts?: SidebarCounts
  onLogout?: () => void
}) {
  const pathname = usePathname()
  return (
    <aside className="border-border bg-card/40 flex w-64 shrink-0 flex-col gap-6 border-r px-4 py-6">
      <Link href="/admin" className="flex items-center gap-2 px-2">
        <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg font-bold">
          P
        </span>
        <span className="text-lg font-semibold">piluvitu</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-6">
        {GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-1">
            <p className="text-muted-foreground px-2 font-mono text-[10px] font-semibold tracking-[0.2em] uppercase">
              {group.title}
            </p>
            {group.items.map((item) => {
              const active = pathname === item.href
              const count = item.countKey ? counts[item.countKey] : undefined
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center justify-between rounded-lg px-2 py-2 text-sm transition-colors',
                    active
                      ? 'bg-accent-soft text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
                  )}
                >
                  <span className="flex items-center gap-3">
                    <FontAwesomeIcon icon={item.icon} className="size-4" />
                    {item.label}
                  </span>
                  {count !== undefined ? (
                    <span className="text-muted-foreground font-mono text-xs">
                      {count}
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="border-border text-muted-foreground flex flex-col gap-2 border-t pt-4 text-sm">
        <a
          href="/"
          className="hover:text-foreground flex items-center gap-3 px-2 transition-colors"
        >
          <FontAwesomeIcon icon={faCubes} className="size-4" /> Design System
        </a>
        <a
          href="/"
          className="hover:text-foreground flex items-center gap-3 px-2 transition-colors"
        >
          <FontAwesomeIcon icon={faUpRightFromSquare} className="size-4" /> Ver
          site
        </a>
        <button
          type="button"
          onClick={onLogout}
          className="hover:text-foreground flex items-center gap-3 px-2 text-left transition-colors"
        >
          <FontAwesomeIcon icon={faRightFromBracket} className="size-4" /> Sair
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Story**

`apps/web/components/admin/admin-sidebar.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { AdminSidebar } from './admin-sidebar'

const meta: Meta<typeof AdminSidebar> = {
  title: 'Admin/AdminSidebar',
  component: AdminSidebar,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<typeof AdminSidebar>

export const Default: Story = {
  args: { counts: { posts: 6, projects: 1, careers: 5, sessions: 2 } },
  render: (args) => (
    <div className="bg-background flex h-screen">
      <AdminSidebar {...args} />
    </div>
  ),
}
```

- [ ] **Step 3: Verify in Storybook**

Run: `cd apps/web && pnpm storybook` → `Admin/AdminSidebar`. Expected: three grouped sections with counts + footer actions.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/admin/admin-sidebar.tsx apps/web/components/admin/admin-sidebar.stories.tsx
git commit -m "feat(admin): AdminSidebar component + story"
```

---

## Task 9: `AdminTopBar` component + story

**Files:**

- Create: `apps/web/components/admin/admin-top-bar.tsx`
- Create: `apps/web/components/admin/admin-top-bar.stories.tsx`

- [ ] **Step 1: Component**

`apps/web/components/admin/admin-top-bar.tsx`:

```tsx
'use client'

import { ModeToggle } from '@/components/mode-toggle'

interface AdminTopBarProps {
  breadcrumb: string[]
  userName?: string
  userInitials?: string
}

export function AdminTopBar({
  breadcrumb,
  userName,
  userInitials,
}: AdminTopBarProps) {
  return (
    <header className="border-border flex items-center justify-between gap-4 border-b px-8 py-4">
      <nav className="text-muted-foreground flex items-center gap-2 font-mono text-sm">
        {breadcrumb.map((crumb, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden>/</span> : null}
            <span
              className={
                i === breadcrumb.length - 1 ? 'text-foreground' : undefined
              }
            >
              {crumb}
            </span>
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <input
          type="search"
          placeholder="Buscar conteúdo…"
          className="border-border bg-muted/40 text-foreground placeholder:text-muted-foreground rounded-pill hidden w-64 border px-4 py-2 text-sm outline-none md:block"
          aria-label="Buscar conteúdo"
        />
        <ModeToggle />
        <div className="bg-accent-soft text-primary rounded-pill flex items-center gap-2 px-3 py-1.5 text-sm">
          <span className="bg-primary text-primary-foreground grid size-6 place-items-center rounded-full text-xs font-bold">
            {userInitials ?? 'PV'}
          </span>
          {userName ? (
            <span className="hidden sm:inline">{userName}</span>
          ) : null}
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Story**

`apps/web/components/admin/admin-top-bar.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { AdminTopBar } from './admin-top-bar'

const meta: Meta<typeof AdminTopBar> = {
  title: 'Admin/AdminTopBar',
  component: AdminTopBar,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<typeof AdminTopBar>

export const Default: Story = {
  args: {
    breadcrumb: ['Coleções', 'Posts'],
    userName: 'Paulo Victor',
    userInitials: 'PV',
  },
}
```

- [ ] **Step 3: Verify in Storybook**

Run: `cd apps/web && pnpm storybook` → `Admin/AdminTopBar`. Expected: breadcrumb left, search + Tema + avatar right.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/admin/admin-top-bar.tsx apps/web/components/admin/admin-top-bar.stories.tsx
git commit -m "feat(admin): AdminTopBar component + story"
```

---

## Task 10: `GithubLinkBanner` + `use-github-link` hook + story

**Files:**

- Create: `apps/web/hooks/admin/use-github-link.ts`
- Create: `apps/web/components/admin/github-link-banner.tsx`
- Create: `apps/web/components/admin/github-link-banner.stories.tsx`

- [ ] **Step 1: Hook**

`apps/web/hooks/admin/use-github-link.ts`:

```ts
'use client'

import { useQuery } from '@tanstack/react-query'

export interface GithubLinkStatus {
  linked: boolean
  login: string | null
}

export function useGithubLink() {
  return useQuery({
    queryKey: ['admin', 'github-status'],
    queryFn: async (): Promise<GithubLinkStatus> => {
      const res = await fetch('/api/admin/github/status')
      if (!res.ok) throw new Error('github status failed')
      return res.json()
    },
    staleTime: 30_000,
  })
}
```

- [ ] **Step 2: Component (presentational; data via prop so it has a clean story)**

`apps/web/components/admin/github-link-banner.tsx`:

```tsx
'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGithub } from '@fortawesome/free-brands-svg-icons'
import { Button } from '@/components/ui/button'

interface GithubLinkBannerProps {
  linked: boolean
  login?: string | null
  onUnlink?: () => void
}

export function GithubLinkBanner({
  linked,
  login,
  onUnlink,
}: GithubLinkBannerProps) {
  if (linked) {
    return (
      <div className="border-border bg-card flex items-center justify-between gap-4 rounded-[var(--radius)] border px-5 py-3 text-sm">
        <span className="flex items-center gap-2">
          <FontAwesomeIcon icon={faGithub} className="size-4" />
          GitHub conectado como{' '}
          <strong className="text-foreground">@{login}</strong> — commits
          atribuídos a você.
        </span>
        <button
          type="button"
          onClick={onUnlink}
          className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          Desconectar
        </button>
      </div>
    )
  }
  return (
    <div className="border-warn/40 bg-warn/10 flex items-center justify-between gap-4 rounded-[var(--radius)] border px-5 py-3 text-sm">
      <span className="flex items-center gap-2">
        <FontAwesomeIcon icon={faGithub} className="size-4" />
        Conecte sua conta GitHub para salvar alterações no conteúdo.
      </span>
      <Button asChild size="sm">
        <a href="/api/admin/github/login">Conectar GitHub</a>
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Story**

`apps/web/components/admin/github-link-banner.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { GithubLinkBanner } from './github-link-banner'

const meta: Meta<typeof GithubLinkBanner> = {
  title: 'Admin/GithubLinkBanner',
  component: GithubLinkBanner,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof GithubLinkBanner>

export const NotLinked: Story = { args: { linked: false } }
export const Linked: Story = { args: { linked: true, login: 'piluvitu' } }
```

- [ ] **Step 4: Type-check + verify in Storybook**

Run: `cd apps/web && pnpm exec tsc --noEmit` (expect no errors), then `pnpm storybook` → `Admin/GithubLinkBanner` (both states render).

- [ ] **Step 5: Commit**

```bash
git add apps/web/hooks/admin/use-github-link.ts apps/web/components/admin/github-link-banner.tsx apps/web/components/admin/github-link-banner.stories.tsx
git commit -m "feat(admin): GithubLinkBanner + use-github-link hook + story"
```

---

## Task 11: `(admin)` route group layout (providers)

**Files:**

- Create: `apps/web/app/(admin)/layout.tsx`

Mirrors the `(site)` provider block (dark-first theme, React Query, Toaster) without the site nav/draft banner.

- [ ] **Step 1: Layout**

`apps/web/app/(admin)/layout.tsx`:

```tsx
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { ReactQueryProvider } from '@/utils/providers/react-query-provider'

export default function AdminGroupLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ReactQueryProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        <div className="bg-background text-foreground min-h-screen">
          {children}
        </div>
        <Toaster />
      </ThemeProvider>
    </ReactQueryProvider>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(admin)/layout.tsx"
git commit -m "feat(admin): (admin) route group layout with providers"
```

---

## Task 12: Admin shell layout (gate + sidebar + top bar)

**Files:**

- Create: `apps/web/app/(admin)/admin/layout.tsx`

Client component: gates on `is_admin` (same pattern as `/votacao/admin`), wires logout, and frames children with sidebar + top bar. Counts come from `useAdminStats` (Task 13 adds the hook; this task imports it, so do Task 13's hook file first OR create a minimal stub — see note).

> **Order note:** create `hooks/admin/use-admin-stats.ts` from Task 13 Step 1 **before** this task compiles, since the layout imports it. The plan lists it in Task 13; pull that one file forward.

- [ ] **Step 1: Layout**

`apps/web/app/(admin)/admin/layout.tsx`:

```tsx
'use client'

import { usePathname } from 'next/navigation'
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { AdminTopBar } from '@/components/admin/admin-top-bar'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentUser } from '@/hooks/votacao/use-current-user'
import { useAdminStats } from '@/hooks/admin/use-admin-stats'
import { votacaoApi } from '@/lib/votacao/api-client'

const CRUMB: Record<string, string[]> = {
  '/admin': ['Coleções', 'Posts'],
  '/admin/projetos': ['Coleções', 'Projetos'],
  '/admin/carreira': ['Coleções', 'Carreira'],
  '/admin/perfil': ['Site', 'Perfil & bio'],
  '/admin/midia': ['Site', 'Mídia'],
  '/admin/sessoes': ['Votação', 'Sessões'],
}

function initials(name?: string) {
  if (!name) return 'PV'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export default function AdminShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname()
  const user = useCurrentUser()
  const stats = useAdminStats()

  if (user.isLoading) {
    return (
      <div className="mx-auto max-w-md p-12">
        <Skeleton className="h-10 w-1/2" />
      </div>
    )
  }

  if (!user.data?.is_admin) {
    return (
      <main className="mx-auto max-w-md p-12">
        <h1 className="text-2xl font-bold">Acesso negado</h1>
        <p className="text-muted-foreground mt-2">
          Esta área é restrita a administradores.
        </p>
      </main>
    )
  }

  const counts = {
    posts: stats.data?.posts,
    projects: stats.data?.projects,
    careers: stats.data?.careers,
  }

  const onLogout = async () => {
    await votacaoApi.logout().catch(() => {})
    window.location.href = '/'
  }

  return (
    <div className="flex min-h-screen">
      <AdminSidebar counts={counts} onLogout={onLogout} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar
          breadcrumb={CRUMB[pathname] ?? ['Admin']}
          userName={user.data.name}
          userInitials={initials(user.data.name)}
        />
        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors (requires `hooks/admin/use-admin-stats.ts` — see order note).

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(admin)/admin/layout.tsx"
git commit -m "feat(admin): admin shell layout (is_admin gate + sidebar + top bar)"
```

---

## Task 13: Dashboard page + `use-admin-stats` hook

**Files:**

- Create: `apps/web/hooks/admin/use-admin-stats.ts`
- Create: `apps/web/app/(admin)/admin/page.tsx`

- [ ] **Step 1: Hook** (create this first — Task 12 depends on it)

`apps/web/hooks/admin/use-admin-stats.ts`:

```ts
'use client'

import { useQuery } from '@tanstack/react-query'
import type { AdminStats } from '@/app/api/admin/stats/route'

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async (): Promise<AdminStats> => {
      const res = await fetch('/api/admin/stats')
      if (!res.ok) throw new Error('admin stats failed')
      return res.json()
    },
    staleTime: 30_000,
  })
}
```

- [ ] **Step 2: Dashboard page**

`apps/web/app/(admin)/admin/page.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { StatCard } from '@/components/admin/stat-card'
import { GithubLinkBanner } from '@/components/admin/github-link-banner'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentUser } from '@/hooks/votacao/use-current-user'
import { useAdminStats } from '@/hooks/admin/use-admin-stats'
import { useGithubLink } from '@/hooks/admin/use-github-link'
import { votacaoApi } from '@/lib/votacao/api-client'

function useSessionsCount() {
  return useQuery({
    queryKey: ['admin', 'sessions-count'],
    queryFn: async () => {
      const r = await votacaoApi.listSessions()
      const sessions = r.sessions ?? []
      return {
        total: sessions.length,
        open: sessions.filter((s) => s.Status === 'open').length,
        closed: sessions.filter((s) => s.Status === 'closed').length,
      }
    },
    staleTime: 30_000,
  })
}

export default function AdminDashboardPage() {
  const user = useCurrentUser()
  const stats = useAdminStats()
  const sessions = useSessionsCount()
  const gh = useGithubLink()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ghParam = params.get('gh')
    if (ghParam === 'linked') toast.success('GitHub conectado')
    if (ghParam === 'error') toast.error('Falha ao conectar o GitHub')
    if (ghParam) {
      params.delete('gh')
      const qs = params.toString()
      window.history.replaceState({}, '', `/admin${qs ? `?${qs}` : ''}`)
      gh.refetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const s = stats.data
  const firstName = user.data?.name?.split(' ')[0] ?? ''

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Bem-vindo de volta, {firstName}</h1>
        <p className="text-muted-foreground">
          Tudo que alimenta o piluvitu.com.br — posts, projetos, carreira e
          votações — em um só lugar.
        </p>
      </header>

      <GithubLinkBanner
        linked={!!gh.data?.linked}
        login={gh.data?.login}
        onUnlink={async () => {
          await fetch('/api/admin/github/unlink', { method: 'POST' })
          gh.refetch()
        }}
      />

      {stats.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-[var(--radius)]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Posts"
            value={s?.posts ?? 0}
            hint={
              <>
                <strong className="text-foreground">{s?.published ?? 0}</strong>{' '}
                publicados ·{' '}
                <strong className="text-foreground">{s?.drafts ?? 0}</strong>{' '}
                rascunho
              </>
            }
          />
          <StatCard
            label="Projetos"
            value={s?.projects ?? 0}
            hint="publicados"
          />
          <StatCard
            label="Experiências"
            value={s?.careers ?? 0}
            hint={
              <>
                <strong className="text-foreground">
                  {s?.careersCurrent ?? 0}
                </strong>{' '}
                atuais
              </>
            }
          />
          <StatCard
            label="Sessões de votação"
            value={sessions.data?.total ?? 0}
            hint={
              <>
                <strong className="text-foreground">
                  {sessions.data?.open ?? 0}
                </strong>{' '}
                aberta ·{' '}
                <strong className="text-foreground">
                  {sessions.data?.closed ?? 0}
                </strong>{' '}
                encerrada
              </>
            }
          />
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-muted-foreground font-mono text-xs font-semibold tracking-[0.2em] uppercase">
          Posts recentes
        </h2>
        <div className="border-border overflow-hidden rounded-[var(--radius)] border">
          {(s?.recentPosts ?? []).map((p) => (
            <div
              key={p.slug}
              className="border-border flex items-center justify-between gap-4 border-b px-5 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{p.title}</p>
                <p className="text-muted-foreground truncate font-mono text-xs">
                  {p.slug}
                </p>
              </div>
              <span className="text-muted-foreground shrink-0 font-mono text-xs">
                {p.draft ? 'Rascunho' : 'Publicado'} · {p.readingTimeMinutes}{' '}
                min
              </span>
            </div>
          ))}
          {!stats.isLoading && (s?.recentPosts?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground px-5 py-6 text-sm">
              Nenhum post ainda.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual smoke (dev)**

Run: `cd apps/web && pnpm dev` (port 3333). Log into votação via Google as an admin (so `/auth/me` returns `is_admin:true`), then open `http://localhost:3333/admin`.
Expected: shell renders, 4 stat cards show real counts, "Conectar GitHub" banner shows. Click it → GitHub authorize → back to `/admin?gh=linked` → banner flips to "conectado como @you". Stop dev server.

> If `/admin` shadows the old Tina static editor: Tina remains reachable at `/admin/index.html` during the interim; the pretty `/admin` URL belongs to the new shell now (Tina is fully retired in slice ⑤).

- [ ] **Step 5: Commit**

```bash
git add apps/web/hooks/admin/use-admin-stats.ts "apps/web/app/(admin)/admin/page.tsx"
git commit -m "feat(admin): unified admin dashboard (stat cards + recent posts)"
```

---

## Task 14: E2E — gate + dashboard + GitHub banner

**Files:**

- Create: `apps/web/app/(admin)/admin/admin.e2e.ts`

Host-agnostic mocks (same pattern as `votacao.e2e.ts`): `**/auth/me` (Go envelope), `**/votacao/sessions` (Go envelope), and same-origin Next routes `**/api/admin/stats`, `**/api/admin/github/status` (plain JSON — these are NOT enveloped).

- [ ] **Step 1: Write the E2E**

`apps/web/app/(admin)/admin/admin.e2e.ts`:

```ts
import { test, expect, type Page } from '@playwright/test'

function envelope(data: unknown) {
  return JSON.stringify({ ok: true, data, notifications: [] })
}

const adminUser = {
  id: 1,
  email: 'a@x.com',
  name: 'Paulo Victor',
  picture: '',
  is_admin: true,
}
const nonAdmin = { ...adminUser, is_admin: false }

const statsBody = {
  posts: 6,
  drafts: 1,
  published: 5,
  projects: 1,
  careers: 5,
  careersCurrent: 2,
  recentPosts: [
    {
      slug: 'como-usar-husky',
      title: 'Como usar o Husky',
      draft: false,
      readingTimeMinutes: 5,
      publishedAt: '2025-04-28',
    },
  ],
}

async function mockCommon(page: Page, opts: { linked: boolean }) {
  await page.route('**/votacao/sessions', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: envelope({
        sessions: [
          {
            ID: 1,
            Title: 'S1',
            Status: 'open',
            CreatedBy: 1,
            CreatedAt: '2025-01-01',
            ClosedAt: null,
            WinnerMovieID: null,
            WinnerMethod: null,
            SortOptionsJSON: '{}',
          },
          {
            ID: 2,
            Title: 'S2',
            Status: 'closed',
            CreatedBy: 1,
            CreatedAt: '2025-01-02',
            ClosedAt: '2025-01-03',
            WinnerMovieID: 3,
            WinnerMethod: 'votes',
            SortOptionsJSON: '{}',
          },
        ],
      }),
    }),
  )
  await page.route('**/api/admin/stats', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(statsBody),
    }),
  )
  await page.route('**/api/admin/github/status', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        linked: opts.linked,
        login: opts.linked ? 'piluvitu' : null,
      }),
    }),
  )
}

test('non-admin sees access denied', async ({ page }) => {
  await page.route('**/auth/me', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: envelope(nonAdmin),
    }),
  )
  await mockCommon(page, { linked: false })
  await page.goto('/admin')
  await expect(page.getByText('Acesso negado')).toBeVisible()
})

test('admin sees the dashboard with stat cards', async ({ page }) => {
  await page.route('**/auth/me', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: envelope(adminUser),
    }),
  )
  await mockCommon(page, { linked: false })
  await page.goto('/admin')
  await expect(
    page.getByRole('heading', { name: /Bem-vindo de volta, Paulo/ }),
  ).toBeVisible()
  await expect(page.getByText('Posts', { exact: true })).toBeVisible()
  await expect(page.getByText('Sessões de votação')).toBeVisible()
  // GitHub not linked → connect CTA
  await expect(
    page.getByRole('link', { name: /Conectar GitHub/ }),
  ).toBeVisible()
})

test('linked GitHub shows the connected banner', async ({ page }) => {
  await page.route('**/auth/me', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: envelope(adminUser),
    }),
  )
  await mockCommon(page, { linked: true })
  await page.goto('/admin')
  await expect(page.getByText(/conectado como/i)).toBeVisible()
  await expect(page.getByText('@piluvitu')).toBeVisible()
})
```

- [ ] **Step 2: Run the E2E**

Run: `cd apps/web && pnpm test:e2e admin.e2e.ts`
Expected: 3 passed. (Playwright auto-starts `pnpm dev` on 3333.)

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(admin)/admin/admin.e2e.ts"
git commit -m "test(admin): E2E for gate, dashboard and GitHub link banner"
```

---

## Task 15: Env, docs and one-time setup notes

**Files:**

- Modify: `apps/web/.env.example`
- Modify: `CLAUDE.md` (root)

- [ ] **Step 1: Add env to `.env.example`**

Append to `apps/web/.env.example` (under a new heading):

```bash
# Admin unificado (/admin)
# Chave de cifragem do cookie do token GitHub linkado (>= 32 bytes aleatórios).
# Gere com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ADMIN_TOKEN_SECRET=
# Reusa a GitHub App do Keystatic (KEYSTATIC_GITHUB_CLIENT_ID/SECRET acima).
# Adicione este Callback URL na App (dev + prod):
#   http://localhost:3333/api/admin/github/callback
#   https://piluvitu.com.br/api/admin/github/callback
```

- [ ] **Step 2: Document in `CLAUDE.md`**

Add a new subsection under "Architecture" in the root `CLAUDE.md`:

```markdown
### Admin unificado (`/admin`)

- **Rota:** `app/(admin)/admin/` — shell DS V2 (sidebar + top bar + dashboard) fora do layout do site. Slice ① (Fundação) entregue; formulários de conteúdo, editor MDX, mídia e a dobra da votação vêm nos slices ②–⑤. Spec: `docs/superpowers/specs/2026-06-03-admin-unificado-fundacao-design.md`.
- **Auth (2 camadas):** gate de UI **client-side** via `useCurrentUser()` (`is_admin`, mesma sessão Google da votação — a API Go não é tocada). A fronteira real de escrita é o **token GitHub linkado**: o GitHub só deixa commitar quem é colaborador do repo.
- **Conectar GitHub:** reusa a GitHub App do Keystatic. `/api/admin/github/login` → authorize → `/callback` troca o code e **sela o token** (`lib/admin/token-cookie.ts`, AES-256-GCM via `crypto` nativo) num cookie httpOnly `piluvitu_admin_gh`. `/status` e `/unlink` completam o fluxo. Precisa de `ADMIN_TOKEN_SECRET` e do Callback URL `…/api/admin/github/callback` registrado na App.
- **Escrita no git:** `lib/admin/git-write.ts` `commitFile({ repo: 'site' | 'blog', path, content, message })` — Octokit com o token linkado; `getContent` p/ sha → `createOrUpdateFileContents`; retry único com refresh em 401. Commit direto na `main` (dispara deploy Vercel). Engine pronta na Fundação, usada pelos formulários dos próximos slices.
- **Stats:** `/api/admin/stats` (server, via readers existentes) alimenta os stat cards + posts recentes; a contagem de sessões vem da API Go client-side.
- **Interino:** o editor Tina antigo segue acessível em `/admin/index.html` até o slice ⑤ (que apaga `/keystatic` e `/admin` Tina).
```

- [ ] **Step 3: Prettier + lint + full suite**

Run from repo root:

```bash
cd apps/web && pnpm prettier:fix && pnpm lint && pnpm test
```

Expected: prettier writes formatting, ESLint clean, Jest green (token-cookie, github-oauth, git-write).

- [ ] **Step 4: Production build sanity**

Run: `cd apps/web && pnpm build:ci`
Expected: build succeeds; `/admin` and `/api/admin/*` appear in the route list with no public-file conflict.

- [ ] **Step 5: Commit**

```bash
git add apps/web/.env.example CLAUDE.md
git commit -m "docs(admin): env + CLAUDE.md for unified admin foundation"
```

---

## Manual one-time setup (you, outside the code)

1. **GitHub App callback URL:** GitHub → Settings → Developer settings → GitHub Apps → (Keystatic app) → **Callback URLs**: add `http://localhost:3333/api/admin/github/callback` and `https://piluvitu.com.br/api/admin/github/callback`.
2. **`ADMIN_TOKEN_SECRET`:** generate (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) and set in `apps/web/.env.local` and in Vercel project env.
3. **(Slice ③ later):** install the same GitHub App on `piluvitu-blog` so post commits are attributed to you; otherwise blog writes fall back to `BLOG_REPO_TOKEN`.

---

## Self-review

**Spec coverage:**

- §4.1 route map → Tasks 5/6/7/8/9/10/11/12/13/14 (all files). ✅
- §4.2 two-layer auth → Task 12 (client gate) + Task 3 (GitHub-permission write boundary). ✅
- §4.3 link flow + sealed cookie → Tasks 1, 2, 6. ✅
- §4.4 `commitFile()` engine → Task 3. ✅
- §4.5 dashboard + shell → Tasks 7–13. ✅
- §4.6 testing (Jest/Storybook/Playwright) → Tasks 1–3 (Jest), 7–10 (Storybook), 14 (Playwright). ✅
- §4.7 env + setup → Task 15 + Manual setup. ✅
- §6 acceptance criteria → covered by Tasks 12/13 (gate, cards), 6/13 (link), 3 (commit), 15 (lint/test/build). ✅

**Type consistency:** `AdminGithubToken` (Task 1) used by `git-write` (Task 3) and `callback` (Task 6). `AdminStats` (Task 5) imported by `use-admin-stats` (Task 13). `commitFile(auth, opts, deps)` signature identical across Task 3 def and test. `useAdminStats`/`useGithubLink`/`useCurrentUser` names consistent across Tasks 10/12/13. `ADMIN_GH_COOKIE` name consistent (Tasks 1/6). ✅

**Placeholder scan:** no TBD/TODO; every code step shows full code; commands have expected output. ✅

**Dependency order callout:** Task 12 imports `use-admin-stats` (Task 13 Step 1) — flagged in both tasks to create that hook file first. ✅
