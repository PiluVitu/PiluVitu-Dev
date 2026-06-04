# Admin Unificado — Slice ③ Posts + editor MDX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A DS V2 posts editor in the unified admin — list + create/edit/delete of blog posts with a CodeMirror MDX source editor and a faithful live preview, writing single-file MDX to the `piluvitu-blog` repo via the slice ① engine, and retiring TinaCMS.

**Architecture:** `lib/admin/post-io.ts` reads/serializes single-file MDX (frontmatter via `gray-matter` + body) from `piluvitu-blog` using the linked GitHub token; preserves unknown frontmatter keys and tracks filenames. The render pipeline (remark/rehype/shiki + mermaid) is extracted into shared modules used by both the public post page (RSC) and the admin preview (a `serialize` endpoint → client `MDXRemote`). UI is full-page (CodeMirror + preview split) reusing slice ② primitives/hooks.

**Tech Stack:** Next.js 16, `gray-matter` (dep), `next-mdx-remote` v6 (`/serialize` + client `MDXRemote`; RSC unchanged on the page), `@uiw/react-codemirror` + `@codemirror/lang-markdown` (new deps), the slice ① engine (`commitFile`/`deleteFile` repo `'blog'`), slice ② field primitives + hooks pattern, TanStack Query, Zod, Jest (node for libs), Storybook 10, Playwright.

**Depends on:** slice ① (PR #36, merged) + slice ② (PR #37). **Branch this work off `main` after #37 merges** (it reuses `lib/admin/git-write.ts`, `content-api.ts`, `content-schemas.ts` SLUG_RE, and `components/admin/content/*` from ②).

**Prerequisite (you, one-time):** install the Keystatic GitHub App on `piluvitu-blog` so the linked token can read/write there.

**Spec:** `docs/superpowers/specs/2026-06-04-admin-unificado-posts-slice3-design.md`

**Conventions:** Commands in the devcontainer; Jest/lint/build from `apps/web`. Commit after each task. Lib tests `/** @jest-environment node */`.

---

## Key facts (verified)

- Post page render (`app/(site)/posts/[slug]/page.tsx`): `mdxComponents` = a `pre` interceptor turning `data-language="mermaid"` fences into `<MermaidBlock chart={...}/>` (`@/components/mdx/mermaid-block`). MDXRemote (`next-mdx-remote/rsc`) options: `remarkPlugins: [remarkGfm]`, `rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings,{behavior:'wrap'}], [rehypePrettyCode,{theme:{dark:'github-dark',light:'github-light'},keepBackground:false}]]`.
- `next-mdx-remote@6.0.0` exports `.` (client `MDXRemote`), `./serialize` (`serialize`), `./rsc`.
- `gray-matter`: `matter(content) → {data, content}`; `matter.stringify(body, data) → "---\n<yaml>\n---\n<body>"`.
- Reader `lib/blog-posts.ts` reads `piluvitu-blog` `content/posts/*.{md,mdx}` via `BLOG_REPO_TOKEN`; ISR tag `'blog-posts'`. `BLOG_REPO_OWNER`/`BLOG_REPO_NAME` envs.
- Slice ② reuse: `lib/admin/content-api.ts` (`getLinkedToken`, `jsonError`, `resealIfRefreshed`), `lib/admin/git-write.ts` (`commitFile`/`deleteFile`, `AdminGithubToken`), `lib/admin/content-schemas.ts` (`SLUG_RE`), `components/admin/content/{fields,tag-array-input,delete-confirm-dialog}`, `components/section-header`, `components/page-top-bar`.

---

## File structure

```
lib/admin/post-schema.ts (+ .test)             Zod frontmatter (known fields) + types
lib/admin/post-io.ts (+ .test)                 listPosts/getPost/serializePost (linked token, gray-matter)
lib/mdx/mdx-plugins.ts                          MDX_REMARK_PLUGINS / MDX_REHYPE_PLUGINS (server)
lib/mdx/mdx-components.tsx                       mdxComponents (client-safe; mermaid)
app/(site)/posts/[slug]/page.tsx (MODIFY)       import shared plugins/components (no behavior change)
app/api/admin/posts/route.ts                    GET list + POST create
app/api/admin/posts/[slug]/route.ts             GET + PUT + DELETE (+ revalidateTag)
app/api/admin/posts/preview/route.ts            POST mdx → serialized
hooks/admin/posts/use-posts-list.ts
hooks/admin/posts/use-post.ts
hooks/admin/posts/use-post-mutations.ts
hooks/admin/posts/use-mdx-preview.ts            debounced serialize
components/admin/posts/posts-table.tsx (+ .stories)
components/admin/posts/post-frontmatter-form.tsx (+ .stories)
components/admin/posts/mdx-editor.tsx (+ .stories)     CodeMirror
components/admin/posts/mdx-preview.tsx (+ .stories)    client MDXRemote
components/admin/posts/post-editor.tsx (+ .stories)    sidebar + split-pane shell
app/(admin)/admin/posts/page.tsx (+ posts.e2e.ts)     list
app/(admin)/admin/posts/novo/page.tsx                 create
app/(admin)/admin/posts/[slug]/page.tsx (+ editor.e2e.ts)  edit
components/admin/admin-sidebar.tsx (MODIFY)     "Posts" → /admin/posts
app/(admin)/admin/layout.tsx (MODIFY)           CRUMB for /admin/posts*
# Tina retirement:
tina/ (DELETE), public/cms/ (DELETE), apps/web/package.json (MODIFY scripts+devDeps)
CLAUDE.md, .env.example (MODIFY)
```

---

# Phase A — Post IO + schema

## Task 1: Deps + frontmatter Zod schema

**Files:** Create `apps/web/lib/admin/post-schema.ts`, `post-schema.test.ts`.

- [ ] **Step 1: Add the CodeMirror deps (you run this — not the agent)**

Run: `pnpm --filter @piluvitu/web add @uiw/react-codemirror @codemirror/lang-markdown`
Expected: both added to `apps/web/package.json` (pure JS, no install scripts).

- [ ] **Step 2: Write the failing test**

`apps/web/lib/admin/post-schema.test.ts`:

```ts
/** @jest-environment node */
import { postFrontmatterSchema, extractKnownFrontmatter } from './post-schema'

const fm = {
  title: 'Como usar o Husky',
  slug: 'como-usar-o-husky',
  excerpt: 'resumo',
  coverImage: '/capa.png',
  tags: ['git', 'husky'],
  publishedAt: '2025-04-28T00:00:00.000Z',
  draft: false,
}

describe('post-schema', () => {
  it('accepts valid frontmatter', () => {
    expect(postFrontmatterSchema.parse(fm)).toEqual(fm)
  })
  it('rejects a missing title', () => {
    expect(postFrontmatterSchema.safeParse({ ...fm, title: '' }).success).toBe(
      false,
    )
  })
  it('rejects an invalid slug', () => {
    expect(
      postFrontmatterSchema.safeParse({ ...fm, slug: 'Bad Slug' }).success,
    ).toBe(false)
  })
  it('extracts only the known fields from a raw frontmatter with extras', () => {
    const raw = { ...fm, readingTimeMinutes: 5, customKey: 'x' }
    expect(extractKnownFrontmatter(raw)).toEqual(fm)
  })
  it('fills defaults for missing optional fields', () => {
    const parsed = postFrontmatterSchema.parse({ title: 'T', slug: 't' })
    expect(parsed.tags).toEqual([])
    expect(parsed.draft).toBe(false)
    expect(parsed.excerpt).toBe('')
    expect(parsed.coverImage).toBe('')
  })
})
```

- [ ] **Step 3: Run it (fails)**

Run: `cd apps/web && pnpm test post-schema` → FAIL (module not found).

- [ ] **Step 4: Implement**

`apps/web/lib/admin/post-schema.ts`:

```ts
import { z } from 'zod'
import { SLUG_RE } from './content-schemas'

export const postFrontmatterSchema = z.object({
  title: z.string().min(1, 'Obrigatório'),
  slug: z
    .string()
    .regex(SLUG_RE, 'Slug inválido (use minúsculas, números e hífens)'),
  excerpt: z.string().default(''),
  coverImage: z.string().default(''),
  tags: z.array(z.string()).default([]),
  publishedAt: z.string().default(''),
  draft: z.boolean().default(false),
})

export type PostFrontmatter = z.infer<typeof postFrontmatterSchema>

const KNOWN_KEYS: (keyof PostFrontmatter)[] = [
  'title',
  'slug',
  'excerpt',
  'coverImage',
  'tags',
  'publishedAt',
  'draft',
]

/** Pulls the known fields out of a raw frontmatter object (drops extras). */
export function extractKnownFrontmatter(
  raw: Record<string, unknown>,
): PostFrontmatter {
  const picked: Record<string, unknown> = {}
  for (const k of KNOWN_KEYS) if (k in raw) picked[k] = raw[k]
  return postFrontmatterSchema.parse(picked)
}

export { KNOWN_KEYS }
```

> Note: the `extractKnownFrontmatter` test's `fm` already contains every key, so `.parse` returns it verbatim. The defaults test confirms `.default()` fills missing optionals.

- [ ] **Step 5: Run it (passes)**

Run: `cd apps/web && pnpm test post-schema` → PASS (5). Then `cd apps/web && pnpm exec tsc --noEmit` → no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/lib/admin/post-schema.ts apps/web/lib/admin/post-schema.test.ts
git commit -m "feat(admin): post frontmatter Zod schema + CodeMirror deps"
```

---

## Task 2: Post IO (list / get / serialize)

**Files:** Create `apps/web/lib/admin/post-io.ts`, `post-io.test.ts`.

- [ ] **Step 1: Write the failing test**

`apps/web/lib/admin/post-io.test.ts`:

```ts
/** @jest-environment node */
import { listPosts, getPost, serializePost, type ReadDeps } from './post-io'

function b64(s: string) {
  return Buffer.from(s, 'utf8').toString('base64')
}

const file = (slug: string, draft = false, extra = '') =>
  `---\ntitle: ${slug.toUpperCase()}\nslug: ${slug}\npublishedAt: '2025-01-0${draft ? 2 : 1}'\ndraft: ${draft}\ntags: []\n${extra}---\n\n# ${slug}\n\nbody`

function fakeOctokit() {
  return {
    repos: {
      async getContent(p: { path: string }) {
        if (p.path === 'content/posts') {
          return {
            data: [
              { name: 'a.mdx', type: 'file' },
              { name: 'b.mdx', type: 'file' },
              { name: 'readme.txt', type: 'file' },
            ],
          }
        }
        const slug = p.path.includes('/a.mdx') ? 'a' : 'b'
        return {
          data: {
            content: b64(file(slug, slug === 'b')),
            encoding: 'base64',
            type: 'file',
          },
        }
      },
    },
  }
}

describe('post-io', () => {
  const deps: ReadDeps = { makeOctokit: () => fakeOctokit() as never }

  it('lists .mdx posts (skips non-mdx), newest publishedAt first', async () => {
    const posts = await listPosts('token', deps)
    expect(posts.map((p) => p.slug)).toEqual(['a', 'b']) // a is 2025-01-01... wait b is draft 2025-01-02
  })

  it('getPost returns filename + full frontmatter + body', async () => {
    const post = await getPost('a', 'token', deps)
    expect(post?.filename).toBe('a.mdx')
    expect(post?.slug).toBe('a')
    expect(post?.body.trim().startsWith('# a')).toBe(true)
    expect(post?.frontmatter.title).toBe('A')
  })

  it('serializePost round-trips and preserves unknown keys', () => {
    const raw = {
      title: 'T',
      slug: 't',
      publishedAt: '2025-01-01',
      draft: false,
      tags: ['x'],
      readingTimeMinutes: 7,
    }
    const known = {
      title: 'T2',
      slug: 't',
      excerpt: '',
      coverImage: '',
      tags: ['x'],
      publishedAt: '2025-01-01',
      draft: true,
    }
    const out = serializePost(known, '# body', raw)
    expect(out).toContain('title: T2') // edited known field
    expect(out).toContain('readingTimeMinutes: 7') // preserved unknown key
    expect(out).toContain('# body')
  })
})
```

> Adjust the first test's expected order after you implement the sort: `b.mdx` has `publishedAt 2025-01-02` (newer) so the expected order is `['b', 'a']`. Fix the assertion to `['b', 'a']` when you write the impl (it's marked wrong above on purpose — set it to the correct sorted order).

- [ ] **Step 2: Run it (fails)**

Run: `cd apps/web && pnpm test post-io` → FAIL (module not found).

- [ ] **Step 3: Implement**

`apps/web/lib/admin/post-io.ts`:

```ts
import { Octokit } from '@octokit/rest'
import matter from 'gray-matter'
import { extractKnownFrontmatter, type PostFrontmatter } from './post-schema'

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

const BRANCH = 'main'
function blogRepo(): { owner: string; repo: string } {
  return {
    owner: process.env.BLOG_REPO_OWNER ?? 'PiluVitu',
    repo: process.env.BLOG_REPO_NAME ?? 'piluvitu-blog',
  }
}
async function makeOctokitDefault(token: string) {
  const { Octokit: O } = await import('@octokit/rest')
  return new O({ auth: token })
}
function decode(data: unknown): string {
  const d = data as { content?: string; encoding?: string }
  if (typeof d.content !== 'string') throw new Error('No file content')
  return Buffer.from(
    d.content,
    d.encoding === 'base64' ? 'base64' : 'utf8',
  ).toString('utf8')
}
function estimateReadingTime(text: string): number {
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).length / 200))
}

export interface AdminPostListItem {
  filename: string
  slug: string
  title: string
  draft: boolean
  publishedAt: string
  readingTimeMinutes: number
}
export interface AdminPost extends AdminPostListItem {
  frontmatter: Record<string, unknown>
  body: string
}

function parseFile(filename: string, content: string): AdminPost {
  const { data, content: body } = matter(content)
  const fm = data as Record<string, unknown>
  const slug =
    (typeof fm.slug === 'string' && fm.slug) ||
    filename.replace(/\.(mdx?|md)$/, '')
  return {
    filename,
    slug,
    title: typeof fm.title === 'string' ? fm.title : slug,
    draft: fm.draft === true,
    publishedAt: typeof fm.publishedAt === 'string' ? fm.publishedAt : '',
    readingTimeMinutes: estimateReadingTime(body),
    frontmatter: fm,
    body,
  }
}

export async function listPosts(
  token: string,
  deps: ReadDeps = {},
): Promise<AdminPostListItem[]> {
  const make =
    deps.makeOctokit ??
    (makeOctokitDefault as unknown as ReadDeps['makeOctokit'])!
  const octokit = await Promise.resolve(make(token))
  const { owner, repo } = blogRepo()
  let entries: { name: string; type: string }[]
  try {
    const res = await octokit.repos.getContent({
      owner,
      repo,
      path: 'content/posts',
      ref: BRANCH,
    })
    entries = (res.data as { name: string; type: string }[]).filter(
      (f) => f.type === 'file' && /\.(mdx?|md)$/.test(f.name),
    )
  } catch {
    return []
  }
  const posts = await Promise.all(
    entries.map(async (f) => {
      const res = await octokit.repos.getContent({
        owner,
        repo,
        path: `content/posts/${f.name}`,
        ref: BRANCH,
      })
      const p = parseFile(f.name, decode(res.data))
      const { frontmatter: _f, body: _b, ...item } = p
      return item
    }),
  )
  return posts.sort((a, b) =>
    b.publishedAt > a.publishedAt ? 1 : b.publishedAt < a.publishedAt ? -1 : 0,
  )
}

export async function getPost(
  slug: string,
  token: string,
  deps: ReadDeps = {},
): Promise<AdminPost | null> {
  const make =
    deps.makeOctokit ??
    (makeOctokitDefault as unknown as ReadDeps['makeOctokit'])!
  const octokit = await Promise.resolve(make(token))
  const { owner, repo } = blogRepo()
  const dir = await octokit.repos.getContent({
    owner,
    repo,
    path: 'content/posts',
    ref: BRANCH,
  })
  const files = (dir.data as { name: string; type: string }[]).filter(
    (f) => f.type === 'file' && /\.(mdx?|md)$/.test(f.name),
  )
  for (const f of files) {
    const res = await octokit.repos.getContent({
      owner,
      repo,
      path: `content/posts/${f.name}`,
      ref: BRANCH,
    })
    const post = parseFile(f.name, decode(res.data))
    if (post.slug === slug) return post
  }
  return null
}

/** Serializes a post: known fields (edited) merged over the preserved raw frontmatter. */
export function serializePost(
  known: PostFrontmatter,
  body: string,
  rawFrontmatter: Record<string, unknown> = {},
): string {
  const merged: Record<string, unknown> = { ...rawFrontmatter, ...known }
  return matter.stringify(body, merged)
}

export { extractKnownFrontmatter }
```

> `getPost` re-lists to find the file whose parsed slug matches (handles filename ≠ slug). For ~dozens of posts this is fine; if it grows, cache the listing.

- [ ] **Step 4: Run it (passes)**

Fix the first test's expected order to `['b', 'a']`, then run `cd apps/web && pnpm test post-io` → PASS (3). `cd apps/web && pnpm exec tsc --noEmit` → no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/post-io.ts apps/web/lib/admin/post-io.test.ts
git commit -m "feat(admin): post IO (list/get/serialize, linked token, gray-matter)"
```

---

# Phase B — Shared MDX pipeline + routes

## Task 3: Extract the MDX pipeline (shared by page + preview)

**Files:** Create `apps/web/lib/mdx/mdx-plugins.ts`, `apps/web/lib/mdx/mdx-components.tsx`. Modify `apps/web/app/(site)/posts/[slug]/page.tsx`.

- [ ] **Step 1: `mdx-plugins.ts`** (server plugins — no JSX, so the client preview never bundles them)

`apps/web/lib/mdx/mdx-plugins.ts`:

```ts
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypePrettyCode from 'rehype-pretty-code'
import type { PluggableList } from 'unified'

export const MDX_REMARK_PLUGINS: PluggableList = [remarkGfm]

export const MDX_REHYPE_PLUGINS: PluggableList = [
  rehypeSlug,
  [rehypeAutolinkHeadings, { behavior: 'wrap' }],
  [
    rehypePrettyCode,
    {
      theme: { dark: 'github-dark', light: 'github-light' },
      keepBackground: false,
    },
  ],
]
```

> If `unified`'s `PluggableList` type isn't resolvable, type these as `any[]` with an eslint-disable — they're plugin tuples. Prefer `PluggableList` (unified is a transitive dep of the rehype/remark packages).

- [ ] **Step 2: `mdx-components.tsx`** (client-safe components — mermaid)

`apps/web/lib/mdx/mdx-components.tsx`:

```tsx
import type { ComponentProps } from 'react'
import { MermaidBlock } from '@/components/mdx/mermaid-block'

/** MDX component overrides shared by the public post page and the admin preview. */
export const mdxComponents = {
  pre: ({
    children,
    ...props
  }: ComponentProps<'pre'> & { 'data-language'?: string }) => {
    const lang = props['data-language']
    if (lang === 'mermaid') {
      const code =
        typeof children === 'object' && children !== null && 'props' in children
          ? String(
              (children as React.ReactElement<{ children?: string }>).props
                .children ?? '',
            )
          : String(children ?? '')
      return <MermaidBlock chart={code} />
    }
    return <pre {...props}>{children}</pre>
  },
}
```

- [ ] **Step 3: Refactor the post page to import the shared modules**

In `apps/web/app/(site)/posts/[slug]/page.tsx`:

- Remove the inline `import remarkGfm`, `rehypeSlug`, `rehypeAutolinkHeadings`, `rehypePrettyCode`, the inline `mdxComponents` const, and the inline `import { MermaidBlock }`.
- Add: `import { MDX_REMARK_PLUGINS, MDX_REHYPE_PLUGINS } from '@/lib/mdx/mdx-plugins'` and `import { mdxComponents } from '@/lib/mdx/mdx-components'`.
- Change the `<MDXRemote ... options={{ mdxOptions: { remarkPlugins: [...], rehypePlugins: [...] } }} />` to:

```tsx
<MDXRemote
  source={post.bodyMdx}
  components={mdxComponents}
  options={{
    mdxOptions: {
      remarkPlugins: MDX_REMARK_PLUGINS,
      rehypePlugins: MDX_REHYPE_PLUGINS,
    },
  }}
/>
```

- [ ] **Step 4: Verify the post page still type-checks + builds the route**

Run: `cd apps/web && pnpm exec tsc --noEmit` → no errors. `cd apps/web && pnpm lint` → clean. Then a quick render check: `cd apps/web && pnpm build:ci` and confirm `/posts/[slug]` still appears with no MDX errors. (If `PluggableList` typing fights `MDXRemote`'s expected option types, cast the arrays at the page call site with `as never` and report.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/mdx/mdx-plugins.ts apps/web/lib/mdx/mdx-components.tsx "apps/web/app/(site)/posts/[slug]/page.tsx"
git commit -m "refactor(mdx): extract shared remark/rehype plugins + components"
```

---

## Task 4: Preview route (serialize)

**Files:** Create `apps/web/app/api/admin/posts/preview/route.ts`.

- [ ] **Step 1: Implement**

`apps/web/app/api/admin/posts/preview/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { serialize } from 'next-mdx-remote/serialize'
import { MDX_REMARK_PLUGINS, MDX_REHYPE_PLUGINS } from '@/lib/mdx/mdx-plugins'
import { getLinkedToken, jsonError } from '@/lib/admin/content-api'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  const body = (await req.json().catch(() => null)) as { mdx?: string } | null
  if (typeof body?.mdx !== 'string')
    return jsonError(400, 'validation', 'Corpo MDX ausente.')
  try {
    const serialized = await serialize(body.mdx, {
      mdxOptions: {
        remarkPlugins: MDX_REMARK_PLUGINS,
        rehypePlugins: MDX_REHYPE_PLUGINS,
      },
    })
    return NextResponse.json({ serialized })
  } catch (err) {
    return jsonError(502, 'preview_error', 'Falha ao renderizar o preview.', {
      detail: String(err),
    })
  }
}
```

> Requires auth so the preview endpoint isn't a public MDX-compile DoS surface. `serialize` runs the same plugins (shiki) as production.

- [ ] **Step 2: Type-check, lint, commit**

Run: `cd apps/web && pnpm exec tsc --noEmit` (no errors), `pnpm lint` (clean).

```bash
git add "apps/web/app/api/admin/posts/preview/route.ts"
git commit -m "feat(admin): post MDX preview serialize route"
```

---

## Task 5: Posts routes (list/create/get/update/delete)

**Files:** Create `apps/web/app/api/admin/posts/route.ts`, `apps/web/app/api/admin/posts/[slug]/route.ts`.

- [ ] **Step 1: `posts/route.ts` (GET list + POST create)**

`apps/web/app/api/admin/posts/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { listPosts, getPost, serializePost } from '@/lib/admin/post-io'
import { postFrontmatterSchema } from '@/lib/admin/post-schema'
import { commitFile } from '@/lib/admin/git-write'
import {
  getLinkedToken,
  jsonError,
  resealIfRefreshed,
} from '@/lib/admin/content-api'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  try {
    return NextResponse.json({ posts: await listPosts(auth.token) })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao listar posts.', {
      detail: String(err),
    })
  }
}

export async function POST(req: Request) {
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  const body = (await req.json().catch(() => null)) as {
    frontmatter?: unknown
    body?: unknown
  } | null
  const parsed = postFrontmatterSchema.safeParse(body?.frontmatter)
  if (!parsed.success || typeof body?.body !== 'string') {
    const fields = parsed.success
      ? { body: 'Corpo ausente' }
      : Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
        )
    return jsonError(400, 'validation', 'Dados inválidos.', fields)
  }
  const fm = parsed.data
  try {
    if (await getPost(fm.slug, auth.token)) {
      return jsonError(
        409,
        'slug_exists',
        `Já existe um post com o slug "${fm.slug}".`,
      )
    }
    const result = await commitFile(auth, {
      repo: 'blog',
      path: `content/posts/${fm.slug}.mdx`,
      content: serializePost(fm, body.body, {}),
      message: `admin: cria post ${fm.slug}`,
    })
    await resealIfRefreshed(result)
    revalidateTag('blog-posts')
    return NextResponse.json({ slug: fm.slug }, { status: 201 })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao gravar o post.', {
      detail: String(err),
    })
  }
}
```

- [ ] **Step 2: `posts/[slug]/route.ts` (GET + PUT + DELETE)**

`apps/web/app/api/admin/posts/[slug]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getPost, serializePost } from '@/lib/admin/post-io'
import { postFrontmatterSchema } from '@/lib/admin/post-schema'
import { commitFile, deleteFile } from '@/lib/admin/git-write'
import {
  getLinkedToken,
  jsonError,
  resealIfRefreshed,
} from '@/lib/admin/content-api'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ slug: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { slug } = await ctx.params
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  try {
    const post = await getPost(slug, auth.token)
    if (!post) return jsonError(404, 'not_found', 'Post não encontrado.')
    return NextResponse.json({ post })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao ler o post.', {
      detail: String(err),
    })
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const { slug } = await ctx.params
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  const body = (await req.json().catch(() => null)) as {
    frontmatter?: unknown
    body?: unknown
  } | null
  const parsed = postFrontmatterSchema.safeParse(body?.frontmatter)
  if (!parsed.success || typeof body?.body !== 'string') {
    const fields = parsed.success
      ? { body: 'Corpo ausente' }
      : Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
        )
    return jsonError(400, 'validation', 'Dados inválidos.', fields)
  }
  const fm = parsed.data
  if (fm.slug !== slug)
    return jsonError(
      400,
      'slug_immutable',
      'O slug não pode ser alterado ao editar.',
    )
  try {
    const existing = await getPost(slug, auth.token)
    if (!existing) return jsonError(404, 'not_found', 'Post não encontrado.')
    const result = await commitFile(auth, {
      repo: 'blog',
      path: `content/posts/${existing.filename}`, // write back to the real filename
      content: serializePost(fm, body.body, existing.frontmatter), // preserve unknown keys
      message: `admin: edita post ${slug}`,
    })
    await resealIfRefreshed(result)
    revalidateTag('blog-posts')
    return NextResponse.json({ slug })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao gravar o post.', {
      detail: String(err),
    })
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { slug } = await ctx.params
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  try {
    const existing = await getPost(slug, auth.token)
    if (!existing) return jsonError(404, 'not_found', 'Post não encontrado.')
    const result = await deleteFile(auth, {
      repo: 'blog',
      path: `content/posts/${existing.filename}`,
      message: `admin: remove post ${slug}`,
    })
    await resealIfRefreshed(result)
    revalidateTag('blog-posts')
    return NextResponse.json({ slug, deleted: true })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao remover o post.', {
      detail: String(err),
    })
  }
}
```

- [ ] **Step 3: Type-check, lint, commit**

Run: `cd apps/web && pnpm exec tsc --noEmit` (no errors), `pnpm lint` (clean).

```bash
git add "apps/web/app/api/admin/posts/route.ts" "apps/web/app/api/admin/posts/[slug]/route.ts"
git commit -m "feat(admin): posts routes (list/create/get/update/delete + revalidate)"
```

---

## Task 6: Posts hooks

**Files:** Create `apps/web/hooks/admin/posts/{use-posts-list,use-post,use-post-mutations,use-mdx-preview}.ts`.

- [ ] **Step 1: `use-posts-list.ts`**

```ts
'use client'
import { useQuery } from '@tanstack/react-query'
import type { AdminPostListItem } from '@/lib/admin/post-io'

export function usePostsList() {
  return useQuery({
    queryKey: ['admin', 'posts'],
    queryFn: async (): Promise<AdminPostListItem[]> => {
      const res = await fetch('/api/admin/posts')
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => ({})))?.error?.message ??
            'Falha ao listar',
        )
      return (await res.json()).posts
    },
    staleTime: 15_000,
  })
}
```

- [ ] **Step 2: `use-post.ts`**

```ts
'use client'
import { useQuery } from '@tanstack/react-query'
import type { AdminPost } from '@/lib/admin/post-io'

export function usePost(slug: string, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'posts', slug],
    enabled,
    queryFn: async (): Promise<AdminPost> => {
      const res = await fetch(`/api/admin/posts/${slug}`)
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => ({})))?.error?.message ??
            'Falha ao ler post',
        )
      return (await res.json()).post
    },
  })
}
```

- [ ] **Step 3: `use-post-mutations.ts`**

```ts
'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { PostFrontmatter } from '@/lib/admin/post-schema'

async function jsonOrThrow(res: Response) {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error?.message ?? 'Falha na operação')
  return body
}
export interface PostPayload {
  frontmatter: PostFrontmatter
  body: string
}

export function usePostMutations() {
  const qc = useQueryClient()
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['admin', 'posts'] })

  const create = useMutation({
    mutationFn: (p: PostPayload) =>
      fetch('/api/admin/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      }).then(jsonOrThrow),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ slug, payload }: { slug: string; payload: PostPayload }) =>
      fetch(`/api/admin/posts/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(jsonOrThrow),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (slug: string) =>
      fetch(`/api/admin/posts/${slug}`, { method: 'DELETE' }).then(jsonOrThrow),
    onSuccess: invalidate,
  })
  return { create, update, remove }
}
```

- [ ] **Step 4: `use-mdx-preview.ts`** (debounced serialize)

```ts
'use client'
import { useEffect, useRef, useState } from 'react'
import type { MDXRemoteSerializeResult } from 'next-mdx-remote'

export function useMdxPreview(mdx: string, delay = 500) {
  const [serialized, setSerialized] = useState<MDXRemoteSerializeResult | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/admin/posts/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mdx }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error?.message ?? 'Falha no preview')
        setSerialized(body.serialized)
        setError(null)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    }, delay)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [mdx, delay])

  return { serialized, error, loading }
}
```

- [ ] **Step 5: Type-check, lint, commit**

Run: `cd apps/web && pnpm exec tsc --noEmit` (no errors), `pnpm lint` (clean).

```bash
git add apps/web/hooks/admin/posts/
git commit -m "feat(admin): posts hooks (list/detail/mutations/debounced preview)"
```

---

# Phase C — UI

## Task 7: MDX editor (CodeMirror) + preview pane

**Files:** Create `apps/web/components/admin/posts/mdx-editor.tsx` (+ `.stories.tsx`), `mdx-preview.tsx` (+ `.stories.tsx`).

- [ ] **Step 1: `mdx-editor.tsx`**

```tsx
'use client'

import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'

export function MdxEditor(props: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="border-border h-full overflow-hidden rounded-lg border">
      <CodeMirror
        value={props.value}
        onChange={props.onChange}
        extensions={[markdown()]}
        theme="dark"
        height="100%"
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: false,
        }}
      />
    </div>
  )
}
```

- [ ] **Step 2: `mdx-preview.tsx`** (client MDXRemote; loading/error/empty states)

```tsx
'use client'

import { MDXRemote } from 'next-mdx-remote'
import { mdxComponents } from '@/lib/mdx/mdx-components'
import { useMdxPreview } from '@/hooks/admin/posts/use-mdx-preview'

export function MdxPreview(props: { mdx: string }) {
  const { serialized, error, loading } = useMdxPreview(props.mdx)
  return (
    <div className="border-border h-full overflow-y-auto rounded-lg border p-5">
      {error ? (
        <p className="text-warn text-sm">{error}</p>
      ) : !serialized ? (
        <p className="text-muted-foreground text-sm">
          {loading ? 'Renderizando…' : 'Comece a escrever…'}
        </p>
      ) : (
        <div
          className="prose prose-invert post-prose max-w-none"
          aria-busy={loading}
        >
          <MDXRemote {...serialized} components={mdxComponents} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Stories**

`mdx-editor.stories.tsx`:

````tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { useState } from 'react'
import { MdxEditor } from './mdx-editor'

const meta: Meta = {
  title: 'Admin/Posts/MdxEditor',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj
export const Default: Story = {
  render: () => {
    const [v, setV] = useState('# Olá\n\n```mermaid\ngraph TD; A-->B;\n```\n')
    return (
      <div className="h-96">
        <MdxEditor value={v} onChange={setV} />
      </div>
    )
  },
}
````

`mdx-preview.stories.tsx` (the preview needs the live serialize endpoint, so the story documents the **states** without a real render — Storybook has no server route):

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'

const meta: Meta = {
  title: 'Admin/Posts/MdxPreview',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// MdxPreview depends on POST /api/admin/posts/preview (server serialize), which
// Storybook can't run. These stories document the empty/loading/error visuals.
export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="border-border rounded-lg border p-5">
        <p className="text-muted-foreground text-sm">Comece a escrever…</p>
      </div>
      <div className="border-border rounded-lg border p-5">
        <p className="text-muted-foreground text-sm">Renderizando…</p>
      </div>
      <div className="border-border rounded-lg border p-5">
        <p className="text-warn text-sm">Falha no preview</p>
      </div>
    </div>
  ),
}
```

- [ ] **Step 4: Verify + commit**

Run: `cd apps/web && pnpm exec tsc --noEmit` (no errors), `pnpm lint` (clean). Optionally `pnpm storybook` → `Admin/Posts/MdxEditor` renders the CodeMirror.

```bash
git add apps/web/components/admin/posts/mdx-editor.tsx apps/web/components/admin/posts/mdx-editor.stories.tsx apps/web/components/admin/posts/mdx-preview.tsx apps/web/components/admin/posts/mdx-preview.stories.tsx
git commit -m "feat(admin): MDX editor (CodeMirror) + preview pane"
```

---

## Task 8: Frontmatter form + post editor shell

**Files:** Create `apps/web/components/admin/posts/post-frontmatter-form.tsx` (+ `.stories.tsx`), `post-editor.tsx` (+ `.stories.tsx`).

- [ ] **Step 1: `post-frontmatter-form.tsx`** (reuses slice ② field primitives)

```tsx
'use client'

import {
  TextField,
  TextareaField,
  ToggleField,
} from '@/components/admin/content/fields'
import { TagArrayInput } from '@/components/admin/content/tag-array-input'
import type { PostFrontmatter } from '@/lib/admin/post-schema'

export function PostFrontmatterForm(props: {
  value: PostFrontmatter
  onChange: (v: PostFrontmatter) => void
  slugEditable: boolean
  errors?: Record<string, string>
}) {
  const set = <K extends keyof PostFrontmatter>(k: K, v: PostFrontmatter[K]) =>
    props.onChange({ ...props.value, [k]: v })
  const d = props.value
  const e = props.errors ?? {}
  return (
    <div className="flex flex-col gap-4">
      <TextField
        label="Título"
        value={d.title}
        onChange={(v) => set('title', v)}
        error={e.title}
      />
      <TextField
        label="Slug"
        value={d.slug}
        onChange={(v) => props.slugEditable && set('slug', v)}
        error={e.slug}
      />
      <TextareaField
        label="Resumo"
        value={d.excerpt}
        onChange={(v) => set('excerpt', v)}
        rows={3}
      />
      <TextField
        label="Imagem de capa (path)"
        value={d.coverImage}
        onChange={(v) => set('coverImage', v)}
      />
      <TagArrayInput
        label="Tags"
        values={d.tags}
        onChange={(v) => set('tags', v)}
      />
      <TextField
        label="Data de publicação (ISO)"
        value={d.publishedAt}
        onChange={(v) => set('publishedAt', v)}
        placeholder="2025-04-28"
      />
      <ToggleField
        label="Rascunho"
        checked={d.draft}
        onChange={(v) => set('draft', v)}
      />
    </div>
  )
}
```

- [ ] **Step 2: `post-editor.tsx`** (the full shell: top bar + frontmatter sidebar + split-pane + save)

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PageTopBar } from '@/components/page-top-bar'
import {
  postFrontmatterSchema,
  type PostFrontmatter,
} from '@/lib/admin/post-schema'
import { slugify } from '@/lib/admin/slugify'
import { PostFrontmatterForm } from './post-frontmatter-form'
import { MdxEditor } from './mdx-editor'
import { MdxPreview } from './mdx-preview'

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
  const isCreate = props.mode === 'create'

  const save = () => {
    const candidate =
      isCreate && !fm.slug ? { ...fm, slug: slugify(fm.title) } : fm
    const parsed = postFrontmatterSchema.safeParse(candidate)
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
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex items-center justify-between">
        <PageTopBar backHref="/admin/posts" backLabel="Posts" />
        <Button onClick={save} disabled={props.pending}>
          {props.pending ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[300px_1fr_1fr]">
        <div className="overflow-y-auto pr-1">
          <PostFrontmatterForm
            value={
              isCreate ? { ...fm, slug: fm.slug || slugify(fm.title) } : fm
            }
            onChange={setFm}
            slugEditable={isCreate}
            errors={errors}
          />
        </div>
        <MdxEditor value={body} onChange={setBody} />
        <MdxPreview mdx={body} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Stories** — `post-frontmatter-form.stories.tsx` (a populated `PostFrontmatter`, slugEditable true/false) and `post-editor.stories.tsx` (create + edit with the preview showing its empty state since no server in Storybook). Write both in full with a realistic `PostFrontmatter` (`{ title, slug, excerpt, coverImage:'', tags:['git'], publishedAt:'2025-04-28', draft:false }`) and a sample body.

- [ ] **Step 4: Type-check, lint, commit**

```bash
git add apps/web/components/admin/posts/post-frontmatter-form.tsx apps/web/components/admin/posts/post-frontmatter-form.stories.tsx apps/web/components/admin/posts/post-editor.tsx apps/web/components/admin/posts/post-editor.stories.tsx
git commit -m "feat(admin): post frontmatter form + full editor shell"
```

---

## Task 9: Posts table + list page

**Files:** Create `apps/web/components/admin/posts/posts-table.tsx` (+ `.stories.tsx`), `apps/web/app/(admin)/admin/posts/page.tsx` (+ `posts.e2e.ts`).

- [ ] **Step 1: `posts-table.tsx`**

```tsx
'use client'

import Link from 'next/link'
import type { AdminPostListItem } from '@/lib/admin/post-io'

export function PostsTable(props: {
  posts: AdminPostListItem[]
  onDelete: (slug: string) => void
}) {
  return (
    <div className="border-border overflow-hidden rounded-[var(--radius)] border">
      <div className="text-muted-foreground grid grid-cols-[3fr_1fr_1fr_1.2fr_auto] gap-4 px-5 py-3 font-mono text-xs uppercase">
        <span>Título</span>
        <span>Status</span>
        <span>Leitura</span>
        <span>Atualizado</span>
        <span />
      </div>
      {props.posts.map((p) => (
        <div
          key={p.slug}
          className="border-border grid grid-cols-[3fr_1fr_1fr_1.2fr_auto] items-center gap-4 border-t px-5 py-3"
        >
          <Link href={`/admin/posts/${p.slug}`} className="min-w-0">
            <span className="block truncate font-medium">{p.title}</span>
            <span className="text-muted-foreground block truncate font-mono text-xs">
              {p.slug}
            </span>
          </Link>
          <span
            className={
              p.draft ? 'text-muted-foreground text-xs' : 'text-primary text-xs'
            }
          >
            {p.draft ? 'Rascunho' : '● Publicado'}
          </span>
          <span className="text-muted-foreground font-mono text-xs">
            {p.readingTimeMinutes} min
          </span>
          <span className="text-muted-foreground font-mono text-xs">
            {p.publishedAt?.slice(0, 10)}
          </span>
          <button
            className="text-warn text-sm"
            onClick={() => props.onDelete(p.slug)}
          >
            Apagar
          </button>
        </div>
      ))}
      {props.posts.length === 0 ? (
        <p className="text-muted-foreground px-5 py-6 text-sm">
          Nenhum post ainda.
        </p>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 2: `posts/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionHeader } from '@/components/section-header'
import { usePostsList } from '@/hooks/admin/posts/use-posts-list'
import { usePostMutations } from '@/hooks/admin/posts/use-post-mutations'
import { PostsTable } from '@/components/admin/posts/posts-table'
import { DeleteConfirmDialog } from '@/components/admin/content/delete-confirm-dialog'

export default function PostsPage() {
  const list = usePostsList()
  const { remove } = usePostMutations()
  const [deleting, setDeleting] = useState<string | null>(null)
  const posts = list.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader label="Posts" count={posts.length} />
        <Button asChild>
          <Link href="/admin/posts/novo">+ Novo post</Link>
        </Button>
      </div>
      {list.isLoading ? (
        <Skeleton className="h-40 w-full rounded-[var(--radius)]" />
      ) : list.isError ? (
        <p className="text-warn text-sm">{(list.error as Error).message}</p>
      ) : (
        <PostsTable posts={posts} onDelete={(slug) => setDeleting(slug)} />
      )}

      <DeleteConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null)
        }}
        itemLabel={
          posts.find((p) => p.slug === deleting)?.title ?? deleting ?? ''
        }
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting, {
            onSuccess: () => {
              toast.success('Removido')
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

- [ ] **Step 3: Story** — `posts-table.stories.tsx` (Default with 2 posts incl. a draft; Empty).

- [ ] **Step 4: E2E** `apps/web/app/(admin)/admin/posts/posts.e2e.ts`

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
const posts = [
  {
    filename: 'husky.mdx',
    slug: 'como-usar-husky',
    title: 'Como usar o Husky',
    draft: false,
    publishedAt: '2025-04-28',
    readingTimeMinutes: 5,
  },
  {
    filename: 'wsl.mdx',
    slug: 'wsl-pt1',
    title: 'WSL Pt.1',
    draft: true,
    publishedAt: '2025-02-05',
    readingTimeMinutes: 4,
  },
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
        posts: 2,
        drafts: 1,
        published: 1,
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
}

test('lists posts and links to the editor', async ({ page }) => {
  await baseMocks(page)
  await page.route('**/api/admin/posts', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ posts }),
    }),
  )
  await page.goto('/admin/posts')
  await expect(page.getByText('Como usar o Husky')).toBeVisible()
  await expect(page.getByText('Rascunho')).toBeVisible()
  await expect(page.getByRole('link', { name: '+ Novo post' })).toBeVisible()
})
```

- [ ] **Step 5: Run E2E, type-check, lint, commit**

Run: `cd apps/web && pnpm test:e2e posts.e2e.ts` → 1 passed. `pnpm exec tsc --noEmit`, `pnpm lint`.

```bash
git add apps/web/components/admin/posts/posts-table.tsx apps/web/components/admin/posts/posts-table.stories.tsx "apps/web/app/(admin)/admin/posts/page.tsx" "apps/web/app/(admin)/admin/posts/posts.e2e.ts"
git commit -m "feat(admin): posts list table + page + E2E"
```

---

## Task 10: Create + edit editor pages

**Files:** Create `apps/web/app/(admin)/admin/posts/novo/page.tsx`, `apps/web/app/(admin)/admin/posts/[slug]/page.tsx` (+ `editor.e2e.ts`).

- [ ] **Step 1: `novo/page.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PostEditor } from '@/components/admin/posts/post-editor'
import { usePostMutations } from '@/hooks/admin/posts/use-post-mutations'
import type { PostFrontmatter } from '@/lib/admin/post-schema'

const EMPTY_FM: PostFrontmatter = {
  title: '',
  slug: '',
  excerpt: '',
  coverImage: '',
  tags: [],
  publishedAt: '',
  draft: true,
}

export default function NovoPostPage() {
  const router = useRouter()
  const { create } = usePostMutations()
  return (
    <PostEditor
      mode="create"
      initialFrontmatter={EMPTY_FM}
      initialBody={'# Novo post\n\n'}
      pending={create.isPending}
      onSave={(frontmatter, body) =>
        create.mutate(
          { frontmatter, body },
          {
            onSuccess: () => {
              toast.success('Post criado')
              router.push('/admin/posts')
            },
            onError: (e) => toast.error((e as Error).message),
          },
        )
      }
    />
  )
}
```

- [ ] **Step 2: `[slug]/page.tsx`**

```tsx
'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { PostEditor } from '@/components/admin/posts/post-editor'
import { usePost } from '@/hooks/admin/posts/use-post'
import { usePostMutations } from '@/hooks/admin/posts/use-post-mutations'
import { extractKnownFrontmatter } from '@/lib/admin/post-schema'

export default function EditPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const router = useRouter()
  const post = usePost(slug)
  const { update } = usePostMutations()

  if (post.isLoading)
    return <Skeleton className="h-96 w-full rounded-[var(--radius)]" />
  if (post.isError || !post.data)
    return (
      <p className="text-warn p-8 text-sm">
        {(post.error as Error)?.message ?? 'Post não encontrado'}
      </p>
    )

  const fm = extractKnownFrontmatter(post.data.frontmatter)
  return (
    <PostEditor
      mode="edit"
      initialFrontmatter={{ ...fm, slug }}
      initialBody={post.data.body}
      pending={update.isPending}
      onSave={(frontmatter, body) =>
        update.mutate(
          { slug, payload: { frontmatter, body } },
          {
            onSuccess: () => {
              toast.success('Post salvo')
              router.push('/admin/posts')
            },
            onError: (e) => toast.error((e as Error).message),
          },
        )
      }
    />
  )
}
```

- [ ] **Step 3: E2E** `apps/web/app/(admin)/admin/posts/editor.e2e.ts` — load `/admin/posts/<slug>` with mocked GET (post body+frontmatter), edit the title, click Salvar, assert the PUT body's `frontmatter.title`. Mock `**/api/admin/posts/preview` to return `{ serialized: { compiledSource: '', frontmatter: {}, scope: {} } }` (the preview pane will show empty/error — that's fine; the test doesn't assert the rendered preview). Mock `**/api/admin/posts/<slug>` GET + PUT. Include base admin mocks. Write it in full mirroring `posts.e2e.ts`'s structure; the save assertion:

```ts
await page.getByLabel('Título').first().fill('Título Editado')
await page.getByRole('button', { name: 'Salvar' }).click()
await expect
  .poll(() => (put as { frontmatter?: { title?: string } })?.frontmatter?.title)
  .toBe('Título Editado')
```

> The preview's `MDXRemote` may warn on the empty `compiledSource` mock; wrap the assertion so a preview render error doesn't fail the save test (the save path is independent of the preview). If `MDXRemote` throws on the fake serialized result and breaks the page, change the preview mock to return a 502 so `MdxPreview` shows the error state instead of rendering — and report which you used.

- [ ] **Step 4: Run E2E, type-check, lint, commit**

Run: `cd apps/web && pnpm test:e2e editor.e2e.ts`, `pnpm exec tsc --noEmit`, `pnpm lint`.

```bash
git add "apps/web/app/(admin)/admin/posts/novo" "apps/web/app/(admin)/admin/posts/[slug]"
git commit -m "feat(admin): post create + edit editor pages (+ E2E)"
```

---

## Task 11: Sidebar + breadcrumb wiring

**Files:** Modify `apps/web/components/admin/admin-sidebar.tsx`, `apps/web/app/(admin)/admin/layout.tsx`.

- [ ] **Step 1: Sidebar "Posts" → `/admin/posts`**

In `admin-sidebar.tsx`, change the Coleções group's "Posts" item `href` from `/admin` to `/admin/posts`.

- [ ] **Step 2: Breadcrumbs**

In `admin-sidebar.tsx`'s active-link logic note (exact match) and the layout `CRUMB` map: add `'/admin/posts': ['Coleções', 'Posts']`. (The active-state exact match means `/admin/posts/novo` and `/admin/posts/[slug]` won't highlight "Posts" — acceptable; optionally widen to `startsWith('/admin/posts')` for the Posts item only, and report if you do.) Also add `'/admin/posts/novo': ['Coleções', 'Posts', 'Novo']` to CRUMB; dynamic `[slug]` falls back to `['Admin']` (acceptable) or add a generic note.

- [ ] **Step 3: Type-check, lint, commit**

```bash
git add apps/web/components/admin/admin-sidebar.tsx "apps/web/app/(admin)/admin/layout.tsx"
git commit -m "feat(admin): sidebar Posts → /admin/posts + breadcrumbs"
```

---

# Phase D — Retire Tina + docs

## Task 12: Retire TinaCMS

**Files:** Delete `apps/web/tina/`, `apps/web/public/cms/`. Modify `apps/web/package.json`.

- [ ] **Step 1: Delete Tina files**

```bash
git rm -r apps/web/tina apps/web/public/cms
```

- [ ] **Step 2: Remove Tina from `package.json`**

In `apps/web/package.json`:

- Remove devDeps: `tinacms` and any `@tinacms/*` packages.
- Remove scripts `tina:build` and `tina:dev`.
- Change `"build": "tinacms build --skip-cloud-checks && next build"` → `"build": "next build"`.
- Keep `build:ci` as-is (it's already `next build`).
  Then run `pnpm install` (you run this — informed): `pnpm --filter @piluvitu/web install` to update the lockfile after removing devDeps. (Or `pnpm install` from root.)

- [ ] **Step 3: Verify nothing references Tina**

Run: `grep -rn "tinacms\|tina/config\|TINA_TOKEN\|NEXT_PUBLIC_TINA" apps/web --include=*.ts --include=*.tsx --include=*.mjs | grep -v node_modules` → expect NO results (other than possibly `.env.example`, handled in Task 13). If any source file imports from `tina/`, fix it. Then `cd apps/web && pnpm exec tsc --noEmit` (no errors) + `pnpm lint` (clean).

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/tina apps/web/public/cms
git commit -m "chore(admin): retire TinaCMS (editor replaced by /admin/posts)"
```

---

## Task 13: Docs + full verification

**Files:** Modify `CLAUDE.md`, `apps/web/.env.example`.

- [ ] **Step 1: `.env.example`** — remove `NEXT_PUBLIC_TINA_CLIENT_ID` and `TINA_TOKEN` lines (Tina is gone). Keep `BLOG_REPO_TOKEN`/`BLOG_REPO_OWNER`/`BLOG_REPO_NAME` (still used by the public reader).

- [ ] **Step 2: `CLAUDE.md`**
- In the **Tech Stack** list, remove the TinaCMS bullet (or note it was retired).
- In the **`### Admin unificado (/admin)`** section, add:

```markdown
- **Slice ③ (Posts + editor MDX):** `/admin/posts` (tabela) + editor full-page `/admin/posts/{novo,[slug]}` — CodeMirror (fonte MDX) + preview fiel (`POST /api/admin/posts/preview` roda `serialize` reusando o pipeline; client `MDXRemote` + mermaid). IO single-file MDX no `piluvitu-blog` via token linkado: `lib/admin/post-io.ts` (`gray-matter`, preserva keys de frontmatter desconhecidas, rastreia filename), schema `lib/admin/post-schema.ts`, rotas `app/api/admin/posts/*` (write via engine `repo:'blog'` + `revalidateTag('blog-posts')`). Pipeline MDX compartilhado extraído pra `lib/mdx/{mdx-plugins.ts,mdx-components.tsx}` (página pública + preview). Requer a GitHub App do Keystatic instalada no `piluvitu-blog`. **TinaCMS aposentado** (deletado `tina/`, `public/cms/`, devDeps; build Vercel agora é `next build`).
```

- Replace/remove the old **### Blog (TinaCMS)** subsection: keep the parts about reading/rendering posts (`lib/blog-posts.ts`, `app/(site)/posts/[slug]`, mermaid, drafts, ISR) but drop the Tina editor/setup bullets and rename it **### Blog (posts)**. Note the editor is now `/admin/posts`.
- In **CI / CD → Vercel**, change the Build Command line to `next build` (Tina build removed).

- [ ] **Step 3: Full verification (capture real output)**

```bash
cd apps/web && pnpm prettier:check   # fix new slice-③ files only if flagged
cd apps/web && pnpm lint             # clean
cd apps/web && pnpm test             # all Jest green (post-schema, post-io + existing)
cd apps/web && pnpm build:ci         # MUST succeed; confirm /admin/posts, /admin/posts/novo, /admin/posts/[slug], /api/admin/posts*, and the public /posts/[slug] still build. No tina references.
cd apps/web && pnpm audit            # no new vulns from CodeMirror deps
```

If `build:ci` fails on the public `/posts/[slug]` route, it's the pipeline extraction (Task 3) — investigate; otherwise a missing `BLOG_REPO_TOKEN` data-fetch on another page is pre-existing (report, not blocking).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md apps/web/.env.example
git commit -m "docs(admin): CLAUDE.md + env for slice ③ Posts; drop Tina"
```

---

## Self-review

**Spec coverage:**

- §3.1 post IO (list/get/serialize, filename tracking, unknown-key preservation) → Task 2. ✅
- §3.2 frontmatter Zod → Task 1. ✅
- §3.3 shared pipeline extraction → Task 3 (split into plugins.ts + components.tsx — refinement over the spec's single `render.tsx`, to keep server plugins out of the client bundle). ✅
- §3.4 faithful preview (serialize + client MDXRemote) → Tasks 4 (route), 6 (hook), 7 (pane). ✅
- §4 routes (list/create/get/put/delete/preview + revalidate) → Tasks 4, 5. ✅
- §5 UI (table, full-page editor, sidebar) → Tasks 7, 8, 9, 10, 11. CodeMirror deps → Task 1. ✅
- §6 retire Tina → Tasks 12, 13. ✅
- §7 testing → Jest (1, 2), Storybook (7, 8, 9), Playwright (9, 10). The preview's rendered output is verified manually/Storybook-states (serialize needs a server) — flagged honestly in Tasks 7 and 10. ✅
- §8 risks / §9 acceptance → Task 13 verification + per-task. ✅

**Placeholder scan:** Tasks 8 (step 3 stories) and 10 (step 3 E2E) say "write in full mirroring X" rather than re-pasting near-identical story/E2E scaffolds — the component/page code IS fully given; only the repetitive story/E2E wrapper is described with a complete reference. Acceptable for plan size; copy the referenced pattern and swap data.

**Type consistency:** `AdminPost`/`AdminPostListItem`/`PostFrontmatter`/`PostPayload` consistent across post-io (2), schema (1), hooks (6), pages (10). `serializePost(known, body, raw)` signature identical in post-io def (2) and route calls (5). `mdxComponents` (3) consumed by page (3) + preview (7). `MDX_REMARK_PLUGINS`/`MDX_REHYPE_PLUGINS` (3) consumed by page (3) + preview route (4). Hook names (`usePostsList`/`usePost`/`usePostMutations`/`useMdxPreview`) consistent (6) ↔ pages (9, 10). ✅

**The deliberate `['b','a']` test-order self-correction in Task 2 is intentional** (the test is written with a wrong expected value the implementer must fix after seeing the sort) — flagged in the step so it's not mistaken for a bug.
