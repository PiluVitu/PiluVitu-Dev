# Admin Unificado — Slice ② CRUD de coleções — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DS V2 CRUD (list + create/edit/delete/drag-reorder) for **Projetos**, **Carreira**, **Socials** and the **Perfil & bio** singleton inside the unified admin, writing YAML to `main` via the slice ① git engine, reading live from GitHub, decoupled from Keystatic.

**Architecture:** A collection **registry** drives generic Zod schemas, a `yaml` serializer, an Octokit live-read path, and generic route handlers. Writes go through the slice ① engine (`commitFile`) plus two new primitives (`deleteFile`, atomic `commitFiles` for reorder). The UI is client-side (TanStack Query, optimistic mutations) with per-surface forms/lists composed from shared field primitives.

**Tech Stack:** Next.js 16 App Router (route handlers, async `params`/`cookies`), Zod 4, `yaml` (new dep), `@octokit/rest`, `@dnd-kit/*` (already deps), TanStack Query, Tailwind/DS V2, Jest (jsdom; node-env for libs), Storybook 10 (`@storybook/nextjs`), Playwright.

**Depends on:** slice ① (PR #36) — `lib/admin/git-write.ts` (`commitFile`, `AdminGithubToken`, `OctokitLike`, `CommitResult`, refresh-on-401), `lib/admin/token-cookie.ts` (`openToken`, `sealToken`, `ADMIN_GH_COOKIE`), the `(admin)` shell + gate, `components/admin/admin-sidebar.tsx`. **Branch this work off the slice-① branch (or off `main` after #36 merges).**

**Spec:** `docs/superpowers/specs/2026-06-03-admin-unificado-colecoes-slice2-design.md`

**Conventions:** Commands run in the devcontainer; Jest/lint/build from `apps/web`. Commit after each task. Lib tests use `/** @jest-environment node */`. No new UI deps — selects are native `<select>`, toggles are custom (no shadcn select/switch).

---

## File structure

```
lib/admin/slugify.ts (+ .test)                    slugify()
lib/admin/content-schemas.ts (+ .test)            Zod per surface + consts (colors, FA values)
lib/admin/content-registry.ts                     COLLECTIONS registry (projects/carreiras/socials)
lib/admin/content-yaml.ts (+ .test)               serializeEntry / parseEntry (yaml dep)
lib/admin/git-write.ts (MODIFY) (+ .test)         + deleteFile + commitFiles
lib/admin/content-read.ts (+ .test)               listEntries / getEntry / readProfile (Octokit)
lib/admin/content-api.ts                          server route helpers (token, resolve, errors, reseal)

app/api/admin/content/[collection]/route.ts             GET list + POST create
app/api/admin/content/[collection]/[slug]/route.ts      PUT update + DELETE
app/api/admin/content/[collection]/reorder/route.ts     POST reorder
app/api/admin/content/profile/route.ts                  GET + PUT singleton

hooks/admin/content/use-content-list.ts           list query
hooks/admin/content/use-content-mutations.ts      create/update/delete/reorder (optimistic)
hooks/admin/content/use-profile.ts                profile query + update

components/admin/content/fields.tsx (+ .stories)         TextField/TextareaField/SelectField/ToggleField
components/admin/content/tag-array-input.tsx (+ .stories)
components/admin/content/fa-icon-select.tsx (+ .stories)
components/admin/content/delete-confirm-dialog.tsx (+ .stories)
components/admin/content/sortable-list.tsx (+ .stories)
components/admin/content/project-form.tsx + project-list.tsx (+ stories)
components/admin/content/carreira-form.tsx + carreira-list.tsx (+ stories)
components/admin/content/social-form.tsx + social-list.tsx (+ stories)
components/admin/content/profile-form.tsx (+ story)

app/(admin)/admin/projetos/page.tsx (+ projetos.e2e.ts)
app/(admin)/admin/carreira/page.tsx (+ carreira.e2e.ts)
app/(admin)/admin/socials/page.tsx (+ socials.e2e.ts)
app/(admin)/admin/perfil/page.tsx (+ perfil.e2e.ts)

components/admin/admin-sidebar.tsx (MODIFY)       add "Redes sociais" nav item
CLAUDE.md (MODIFY)
```

---

# Phase A — Shared infra (lib, no UI)

## Task 1: `yaml` dep + `slugify` + Zod schemas

**Files:** Create `apps/web/lib/admin/slugify.ts`, `slugify.test.ts`, `content-schemas.ts`, `content-schemas.test.ts`.

- [ ] **Step 1: Add the `yaml` dependency (you run this — not the agent)**

Run from repo root: `pnpm --filter @piluvitu/web add yaml`
Expected: `yaml` added to `apps/web/package.json` dependencies. (Pure JS, no install scripts — no `allowBuilds` entry needed; `minimumReleaseAge` applies.)

- [ ] **Step 2: Write the failing slugify test**

`apps/web/lib/admin/slugify.test.ts`:

```ts
/** @jest-environment node */
import { slugify } from './slugify'

describe('slugify', () => {
  it('lowercases, strips accents, hyphenates', () => {
    expect(slugify('Live PRs')).toBe('live-prs')
    expect(slugify('Configuração Inicial')).toBe('configuracao-inicial')
  })
  it('collapses separators and trims', () => {
    expect(slugify('  A — B / C  ')).toBe('a-b-c')
    expect(slugify('a__b--c')).toBe('a-b-c')
  })
  it('drops non-alphanumerics', () => {
    expect(slugify('C++ & Go!')).toBe('c-go')
  })
})
```

- [ ] **Step 3: Run it (fails)**

Run: `cd apps/web && pnpm test slugify`
Expected: FAIL — `Cannot find module './slugify'`.

- [ ] **Step 4: Implement slugify**

`apps/web/lib/admin/slugify.ts`:

```ts
/** Produces a URL-safe slug: lowercase, accent-stripped, hyphen-separated. */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumerics → hyphen
    .replace(/^-+|-+$/g, '') // trim hyphens
}
```

- [ ] **Step 5: Run it (passes)**

Run: `cd apps/web && pnpm test slugify`
Expected: PASS (3 tests).

- [ ] **Step 6: Write the failing schemas test**

`apps/web/lib/admin/content-schemas.test.ts`:

```ts
/** @jest-environment node */
import {
  projectSchema,
  carreiraSchema,
  socialSchema,
  profileSchema,
  SLUG_RE,
} from './content-schemas'

const project = {
  projectSlug: 'live-prs',
  order: 0,
  projectName: 'Live PRs',
  subtitle: '',
  projectLogo: '/x.svg',
  description: 'desc',
  tags: ['Go'],
  deployLink: '',
  repoLink: '',
  image: '/i.png',
  altImage: 'LPR',
}

describe('content-schemas', () => {
  it('accepts a valid project', () => {
    expect(projectSchema.parse(project)).toEqual(project)
  })
  it('rejects an invalid slug', () => {
    expect(
      projectSchema.safeParse({ ...project, projectSlug: 'Bad Slug' }).success,
    ).toBe(false)
  })
  it('rejects a negative order', () => {
    expect(projectSchema.safeParse({ ...project, order: -1 }).success).toBe(
      false,
    )
  })
  it('accepts a valid carreira', () => {
    expect(
      carreiraSchema.safeParse({
        orgSlug: 'aride',
        order: 1,
        orgName: 'Aride',
        orgDescription: 'd',
        orgLink: '',
        image: '',
        altImage: 'AR',
        title: 'Dev',
        location: 'Remoto',
        date: 'Mar 2024',
        atribuitions: ['x'],
        current: true,
        tags: ['Remoto'],
      }).success,
    ).toBe(true)
  })
  it('rejects an unknown social icon and accepts a known one', () => {
    const base = {
      key: 'github',
      order: 0,
      socialDescription: 'd',
      socialLink: 'https://x',
      iconMode: 'fontawesome' as const,
      fontawesomeIcon: 'brands__github',
      image: '',
      altImage: 'GH',
    }
    expect(socialSchema.safeParse(base).success).toBe(true)
    expect(
      socialSchema.safeParse({ ...base, fontawesomeIcon: 'nope__x' }).success,
    ).toBe(false)
  })
  it('accepts a valid profile and rejects an unknown color', () => {
    const base = {
      displayName: 'Paulo',
      avatarSrc: '/a.jpg',
      avatarAlt: 'alt',
      roleHighlight: 'SRE',
      companyName: 'Reapho',
      companyLink: '',
      companyLinkColor: '#14b8a6',
      bio: 'b',
      availabilityOpen: true,
      availabilityLabel: 'Disponível',
      location: 'Brasil',
      disciplines: ['SRE'],
    }
    expect(profileSchema.safeParse(base).success).toBe(true)
    expect(
      profileSchema.safeParse({ ...base, companyLinkColor: '#000000' }).success,
    ).toBe(false)
  })
  it('exposes a slug regex', () => {
    expect(SLUG_RE.test('live-prs')).toBe(true)
    expect(SLUG_RE.test('Bad')).toBe(false)
  })
})
```

- [ ] **Step 7: Run it (fails)**

Run: `cd apps/web && pnpm test content-schemas`
Expected: FAIL — `Cannot find module './content-schemas'`.

- [ ] **Step 8: Implement the schemas**

`apps/web/lib/admin/content-schemas.ts`:

```ts
import { z } from 'zod'
import { VISIT_CARD_FA_SELECT_OPTIONS } from '@/lib/visit-card-fontawesome'

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Hex values offered for the company-name color (mirrors keystatic.config.ts). */
export const COMPANY_LINK_COLORS: { label: string; value: string }[] = [
  { label: 'Azul índigo (padrão)', value: '#4a65fc' },
  { label: 'Azul vivo', value: '#3b82f6' },
  { label: 'Azul royal', value: '#2563eb' },
  { label: 'Ciano', value: '#06b6d4' },
  { label: 'Verde água', value: '#14b8a6' },
  { label: 'Verde', value: '#22c55e' },
  { label: 'Verde lima', value: '#84cc16' },
  { label: 'Amarelo ouro', value: '#eab308' },
  { label: 'Laranja', value: '#f97316' },
  { label: 'Vermelho', value: '#ef4444' },
  { label: 'Rosa', value: '#ec4899' },
  { label: 'Roxo', value: '#a855f7' },
  { label: 'Violeta', value: '#8b5cf6' },
  { label: 'Índigo', value: '#6366f1' },
  { label: 'Branco suave (destaca no fundo escuro)', value: '#f8fafc' },
  { label: 'Cinza claro', value: '#94a3b8' },
]

const COLOR_VALUES = new Set(COMPANY_LINK_COLORS.map((c) => c.value))
const FA_VALUES = new Set(VISIT_CARD_FA_SELECT_OPTIONS.map((o) => o.value))

const slug = z
  .string()
  .regex(SLUG_RE, 'Slug inválido (use minúsculas, números e hífens)')
const order = z.number().int().min(0)
const str = z.string()
const reqStr = z.string().min(1, 'Obrigatório')
const strArray = z.array(z.string())

export const projectSchema = z.object({
  projectSlug: slug,
  order,
  projectName: reqStr,
  subtitle: str.default(''),
  projectLogo: str,
  description: str,
  tags: strArray,
  deployLink: str,
  repoLink: str,
  image: str,
  altImage: str,
})

export const carreiraSchema = z.object({
  orgSlug: slug,
  order,
  orgName: reqStr,
  orgDescription: str,
  orgLink: str,
  image: str,
  altImage: str,
  title: str,
  location: str,
  date: str,
  atribuitions: strArray,
  current: z.boolean(),
  tags: strArray,
})

export const socialSchema = z.object({
  key: slug,
  order,
  socialDescription: str,
  socialLink: str,
  iconMode: z.enum(['fontawesome', 'image']),
  fontawesomeIcon: z
    .string()
    .refine((v) => FA_VALUES.has(v), 'Ícone Font Awesome inválido'),
  image: str,
  altImage: str,
})

export const profileSchema = z.object({
  displayName: reqStr,
  avatarSrc: str,
  avatarAlt: str,
  roleHighlight: str,
  companyName: str,
  companyLink: str,
  companyLinkColor: z
    .string()
    .refine((v) => COLOR_VALUES.has(v), 'Cor inválida'),
  bio: str,
  availabilityOpen: z.boolean(),
  availabilityLabel: str,
  location: str,
  disciplines: strArray,
})

export type ProjectEntry = z.infer<typeof projectSchema>
export type CarreiraEntry = z.infer<typeof carreiraSchema>
export type SocialEntry = z.infer<typeof socialSchema>
export type ProfileEntry = z.infer<typeof profileSchema>
```

- [ ] **Step 9: Run it (passes)**

Run: `cd apps/web && pnpm test content-schemas` → PASS (7 tests). Then `cd apps/web && pnpm exec tsc --noEmit` → no errors.

- [ ] **Step 10: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/lib/admin/slugify.ts apps/web/lib/admin/slugify.test.ts apps/web/lib/admin/content-schemas.ts apps/web/lib/admin/content-schemas.test.ts
git commit -m "feat(admin): yaml dep + slugify + Zod content schemas"
```

---

## Task 2: Collection registry

**Files:** Create `apps/web/lib/admin/content-registry.ts`.

- [ ] **Step 1: Implement the registry**

`apps/web/lib/admin/content-registry.ts`:

```ts
import type { ZodType } from 'zod'
import {
  projectSchema,
  carreiraSchema,
  socialSchema,
  type ProjectEntry,
  type CarreiraEntry,
  type SocialEntry,
} from './content-schemas'

export type CollectionKey = 'projects' | 'carreiras' | 'socials'

export interface CollectionDef<T extends Record<string, unknown>> {
  key: CollectionKey
  label: string
  dir: string
  slugField: keyof T & string
  schema: ZodType<T>
  /** YAML key order on disk (minimizes diffs). */
  keyOrder: (keyof T & string)[]
  /** Fields serialized as block scalars (long text). */
  multiline: (keyof T & string)[]
}

export const COLLECTIONS = {
  projects: {
    key: 'projects',
    label: 'Projetos',
    dir: 'content/projects',
    slugField: 'projectSlug',
    schema: projectSchema,
    keyOrder: [
      'projectSlug',
      'order',
      'projectName',
      'subtitle',
      'projectLogo',
      'description',
      'tags',
      'deployLink',
      'repoLink',
      'image',
      'altImage',
    ],
    multiline: ['description'],
  } as CollectionDef<ProjectEntry>,
  carreiras: {
    key: 'carreiras',
    label: 'Carreira',
    dir: 'content/carreiras',
    slugField: 'orgSlug',
    schema: carreiraSchema,
    keyOrder: [
      'orgSlug',
      'order',
      'orgName',
      'orgDescription',
      'orgLink',
      'image',
      'altImage',
      'title',
      'location',
      'date',
      'atribuitions',
      'current',
      'tags',
    ],
    multiline: ['orgDescription'],
  } as CollectionDef<CarreiraEntry>,
  socials: {
    key: 'socials',
    label: 'Redes sociais',
    dir: 'content/socials',
    slugField: 'key',
    schema: socialSchema,
    keyOrder: [
      'key',
      'order',
      'socialDescription',
      'socialLink',
      'iconMode',
      'fontawesomeIcon',
      'image',
      'altImage',
    ],
    multiline: [],
  } as CollectionDef<SocialEntry>,
} satisfies Record<CollectionKey, CollectionDef<Record<string, unknown>>>

export function getCollection(
  key: string,
): CollectionDef<Record<string, unknown>> | null {
  return (
    (COLLECTIONS as Record<string, CollectionDef<Record<string, unknown>>>)[
      key
    ] ?? null
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm exec tsc --noEmit` → no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/admin/content-registry.ts
git commit -m "feat(admin): collection registry"
```

---

## Task 3: YAML serializer + parser

**Files:** Create `apps/web/lib/admin/content-yaml.ts`, `content-yaml.test.ts`.

- [ ] **Step 1: Write the failing test**

`apps/web/lib/admin/content-yaml.test.ts`:

```ts
/** @jest-environment node */
import { serializeEntry, parseEntry } from './content-yaml'
import { COLLECTIONS } from './content-registry'

const project = {
  projectSlug: 'live-prs',
  order: 0,
  projectName: 'Live PRs',
  subtitle: 'agregador',
  projectLogo: '/x.svg',
  description:
    'uma descrição razoavelmente longa que pode ser dobrada em múltiplas linhas pelo serializador',
  tags: ['React', 'Go'],
  deployLink: 'https://x',
  repoLink: '',
  image: '/i.png',
  altImage: 'LPR',
}

describe('content-yaml', () => {
  it('round-trips a project through serialize → parse', () => {
    const yaml = serializeEntry(COLLECTIONS.projects, project)
    expect(typeof yaml).toBe('string')
    expect(parseEntry(COLLECTIONS.projects, yaml)).toEqual(project)
  })
  it('emits keys in registry order', () => {
    const yaml = serializeEntry(COLLECTIONS.projects, project)
    const keys = yaml
      .split('\n')
      .map((l) => l.match(/^([a-zA-Z]+):/)?.[1])
      .filter(Boolean)
    expect(keys.slice(0, 3)).toEqual(['projectSlug', 'order', 'projectName'])
  })
  it('rejects content that fails the schema on parse', () => {
    expect(() =>
      parseEntry(
        COLLECTIONS.projects,
        'projectSlug: Bad Slug\norder: 0\nprojectName: x',
      ),
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run it (fails)**

Run: `cd apps/web && pnpm test content-yaml` → FAIL (module not found).

- [ ] **Step 3: Implement the serializer**

`apps/web/lib/admin/content-yaml.ts`:

```ts
import { Document, Scalar, parse as yamlParse } from 'yaml'
import type { CollectionDef } from './content-registry'

/** Serializes an entry to YAML with keys in registry order; long text as block scalars. */
export function serializeEntry<T extends Record<string, unknown>>(
  def: CollectionDef<T>,
  data: T,
): string {
  const doc = new Document({})
  doc.contents = doc.createNode({}) as never
  for (const key of def.keyOrder) {
    const value = data[key]
    const node = doc.createNode(value)
    if (
      def.multiline.includes(key) &&
      typeof value === 'string' &&
      value.length > 0
    ) {
      ;(node as Scalar).type = Scalar.BLOCK_FOLDED
    }
    // @ts-expect-error YAMLMap.set accepts (key, node)
    doc.contents.set(key, node)
  }
  return doc.toString({ lineWidth: 80 })
}

/** Parses YAML and validates against the collection schema (throws on invalid). */
export function parseEntry<T extends Record<string, unknown>>(
  def: CollectionDef<T>,
  raw: string,
): T {
  const obj = yamlParse(raw) as unknown
  return def.schema.parse(obj)
}
```

> Note: `def.schema.parse` applies `.default('')` for `subtitle`, so a parsed project without `subtitle` still round-trips. The `lineWidth: 80` triggers folding of the long `description`.

- [ ] **Step 4: Run it (passes)**

Run: `cd apps/web && pnpm test content-yaml` → PASS (3 tests). If the round-trip fails because `yaml` folds whitespace differently, set `multiline` block scalars to `Scalar.BLOCK_LITERAL` instead of `BLOCK_FOLDED` and re-run (literal preserves exact text). Report which you used.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/content-yaml.ts apps/web/lib/admin/content-yaml.test.ts
git commit -m "feat(admin): YAML serializer/parser for content entries"
```

---

## Task 4: Engine — `deleteFile`

**Files:** Modify `apps/web/lib/admin/git-write.ts`; extend `git-write.test.ts`.

- [ ] **Step 1: Add the failing test**

Append inside the existing `describe('commitFile', ...)` block's file (add a new top-level `describe`) in `apps/web/lib/admin/git-write.test.ts`:

```ts
describe('deleteFile', () => {
  it('throws AdminAuthError when not linked', async () => {
    const { deleteFile } = await import('./git-write')
    await expect(
      deleteFile(null, {
        repo: 'site',
        path: 'content/x/i.yaml',
        message: 'm',
      }),
    ).rejects.toBeInstanceOf(AdminAuthError)
  })

  it('looks up the sha then deletes', async () => {
    const { deleteFile } = await import('./git-write')
    const calls: { get: any[]; del: any[] } = { get: [], del: [] }
    const octokit: OctokitLike = {
      repos: {
        async getContent(p) {
          calls.get.push(p)
          return { data: { sha: 'sha1' } }
        },
        async createOrUpdateFileContents() {
          return { data: { commit: { sha: 'x' } } }
        },
        // @ts-expect-error extended in impl
        async deleteFile(p) {
          calls.del.push(p)
          return { data: { commit: { sha: 'del-commit' } } }
        },
      },
    }
    const res = await deleteFile(
      { token: 't', login: 'me' },
      { repo: 'site', path: 'content/projects/x/index.yaml', message: 'rm' },
      { makeOctokit: () => octokit },
    )
    expect(res.commitSha).toBe('del-commit')
    expect(calls.del[0]).toMatchObject({
      owner: 'PiluVitu',
      repo: 'PiluVitu-Dev',
      sha: 'sha1',
    })
  })
})
```

Add `AdminAuthError`, `OctokitLike` to the existing import line at the top of the test file if not already imported (the existing file imports `commitFile, AdminAuthError, type OctokitLike`).

- [ ] **Step 2: Run it (fails)**

Run: `cd apps/web && pnpm test git-write` → FAIL (deleteFile not exported / `deleteFile` missing on OctokitLike).

- [ ] **Step 3: Extend `OctokitLike` and implement `deleteFile`**

In `apps/web/lib/admin/git-write.ts`, add `deleteFile` to the `OctokitLike['repos']` interface:

```ts
    deleteFile(params: {
      owner: string
      repo: string
      path: string
      message: string
      sha: string
      branch?: string
    }): Promise<{ data: { commit: { sha?: string } } }>
```

Then add the function (after `commitFile`):

```ts
export async function deleteFile(
  auth: AdminGithubToken | null,
  opts: { repo: Repo; path: string; message: string; branch?: string },
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
    const existing = await octokit.repos.getContent({
      owner,
      repo,
      path: opts.path,
      ref: branch,
    })
    const data = existing.data as { sha?: string } | unknown[]
    if (
      Array.isArray(data) ||
      !data ||
      typeof data !== 'object' ||
      !('sha' in data)
    ) {
      throw new Error(`Cannot resolve sha for ${opts.path}`)
    }
    const res = await octokit.repos.deleteFile({
      owner,
      repo,
      path: opts.path,
      branch,
      message: opts.message,
      sha: (data as { sha: string }).sha,
    })
    const sha = res.data.commit.sha
    if (!sha) throw new Error('GitHub API returned no commit sha')
    return sha
  }

  try {
    return { commitSha: await run(auth.token) }
  } catch (err) {
    if (
      (err as { status?: number } | null)?.status === 401 &&
      auth.refreshToken
    ) {
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

(`repoSlug`, `ghRefresh`, `Octokit`, `Repo`, `AdminAuthError`, `CommitDeps`, `CommitResult`, `AdminGithubToken` already exist in this file from slice ①.)

- [ ] **Step 4: Run it (passes)**

Run: `cd apps/web && pnpm test git-write` → PASS (existing + 2 new). `cd apps/web && pnpm exec tsc --noEmit` → no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/git-write.ts apps/web/lib/admin/git-write.test.ts
git commit -m "feat(admin): engine deleteFile"
```

---

## Task 5: Engine — `commitFiles` (atomic multi-file)

**Files:** Modify `apps/web/lib/admin/git-write.ts`; extend `git-write.test.ts`.

- [ ] **Step 1: Add the failing test**

Add a `describe('commitFiles', ...)` to `git-write.test.ts`:

```ts
describe('commitFiles', () => {
  it('creates a tree commit and updates the ref', async () => {
    const { commitFiles } = await import('./git-write')
    const seen: Record<string, unknown> = {}
    const octokit = {
      repos: {
        async getContent() {
          return { data: {} }
        },
        async createOrUpdateFileContents() {
          return { data: { commit: { sha: 'x' } } }
        },
      },
      git: {
        async getRef(p: unknown) {
          seen.getRef = p
          return { data: { object: { sha: 'base-commit' } } }
        },
        async getCommit(p: unknown) {
          seen.getCommit = p
          return { data: { tree: { sha: 'base-tree' } } }
        },
        async createTree(p: unknown) {
          seen.createTree = p
          return { data: { sha: 'new-tree' } }
        },
        async createCommit(p: unknown) {
          seen.createCommit = p
          return { data: { sha: 'new-commit' } }
        },
        async updateRef(p: unknown) {
          seen.updateRef = p
          return { data: {} }
        },
      },
    }
    const res = await commitFiles(
      { token: 't', login: 'me' },
      {
        repo: 'site',
        message: 'reorder',
        files: [
          { path: 'content/projects/a/index.yaml', content: 'order: 0' },
          { path: 'content/projects/b/index.yaml', content: 'order: 1' },
        ],
      },
      // @ts-expect-error test double has the extra git namespace
      { makeOctokit: () => octokit },
    )
    expect(res.commitSha).toBe('new-commit')
    expect((seen.createTree as { tree: unknown[] }).tree).toHaveLength(2)
    expect((seen.updateRef as { sha: string }).sha).toBe('new-commit')
  })
})
```

- [ ] **Step 2: Run it (fails)**

Run: `cd apps/web && pnpm test git-write` → FAIL (commitFiles not exported).

- [ ] **Step 3: Implement `commitFiles`**

Extend `OctokitLike` with a `git` namespace and add the function. In `git-write.ts`, add to `OctokitLike`:

```ts
  git: {
    getRef(p: { owner: string; repo: string; ref: string }): Promise<{ data: { object: { sha: string } } }>
    getCommit(p: { owner: string; repo: string; commit_sha: string }): Promise<{ data: { tree: { sha: string } } }>
    createTree(p: {
      owner: string; repo: string; base_tree: string
      tree: { path: string; mode: '100644'; type: 'blob'; content: string }[]
    }): Promise<{ data: { sha: string } }>
    createCommit(p: { owner: string; repo: string; message: string; tree: string; parents: string[] }): Promise<{ data: { sha: string } }>
    updateRef(p: { owner: string; repo: string; ref: string; sha: string }): Promise<{ data: unknown }>
  }
```

Then:

```ts
export async function commitFiles(
  auth: AdminGithubToken | null,
  opts: {
    repo: Repo
    message: string
    files: { path: string; content: string }[]
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
  const ref = `heads/${branch}`

  const run = async (token: string): Promise<string> => {
    const octokit = await Promise.resolve(makeOctokit(token))
    const baseRef = await octokit.git.getRef({ owner, repo, ref })
    const baseCommit = baseRef.data.object.sha
    const base = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: baseCommit,
    })
    const tree = await octokit.git.createTree({
      owner,
      repo,
      base_tree: base.data.tree.sha,
      tree: opts.files.map((f) => ({
        path: f.path,
        mode: '100644',
        type: 'blob',
        content: f.content,
      })),
    })
    const commit = await octokit.git.createCommit({
      owner,
      repo,
      message: opts.message,
      tree: tree.data.sha,
      parents: [baseCommit],
    })
    await octokit.git.updateRef({ owner, repo, ref, sha: commit.data.sha })
    return commit.data.sha
  }

  try {
    return { commitSha: await run(auth.token) }
  } catch (err) {
    if (
      (err as { status?: number } | null)?.status === 401 &&
      auth.refreshToken
    ) {
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

- [ ] **Step 4: Run it (passes)**

Run: `cd apps/web && pnpm test git-write` → PASS. `cd apps/web && pnpm exec tsc --noEmit` → no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/git-write.ts apps/web/lib/admin/git-write.test.ts
git commit -m "feat(admin): engine commitFiles (atomic multi-file via Git Data API)"
```

---

## Task 6: Live content reader

**Files:** Create `apps/web/lib/admin/content-read.ts`, `content-read.test.ts`.

- [ ] **Step 1: Write the failing test**

`apps/web/lib/admin/content-read.test.ts`:

```ts
/** @jest-environment node */
import { listEntries, type ReadDeps } from './content-read'
import { COLLECTIONS } from './content-registry'

function b64(s: string) {
  return Buffer.from(s, 'utf8').toString('base64')
}

describe('listEntries', () => {
  it('lists dir, fetches each index.yaml, parses + sorts by order', async () => {
    const fakeOctokit = {
      repos: {
        async getContent(p: { path: string }) {
          if (p.path === 'content/projects') {
            return {
              data: [
                { name: 'b', type: 'dir' },
                { name: 'a', type: 'dir' },
              ],
            }
          }
          const slug = p.path.includes('/a/') ? 'a' : 'b'
          const order = slug === 'a' ? 1 : 0
          const yaml = `projectSlug: ${slug}\norder: ${order}\nprojectName: ${slug.toUpperCase()}\nsubtitle: ''\nprojectLogo: ''\ndescription: ''\ntags: []\ndeployLink: ''\nrepoLink: ''\nimage: ''\naltImage: ''`
          return { data: { content: b64(yaml), encoding: 'base64' } }
        },
      },
    }
    const deps: ReadDeps = { makeOctokit: () => fakeOctokit as never }
    const entries = await listEntries(COLLECTIONS.projects, 'token', deps)
    expect(entries.map((e) => e.slug)).toEqual(['b', 'a']) // sorted by order 0,1
    expect(entries[0].data.projectName).toBe('B')
  })
})
```

- [ ] **Step 2: Run it (fails)**

Run: `cd apps/web && pnpm test content-read` → FAIL (module not found).

- [ ] **Step 3: Implement the reader**

`apps/web/lib/admin/content-read.ts`:

```ts
import { Octokit } from '@octokit/rest'
import { parse as yamlParse } from 'yaml'
import { profileSchema, type ProfileEntry } from './content-schemas'
import type { CollectionDef } from './content-registry'

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

function decode(data: unknown): string {
  const d = data as { content?: string; encoding?: string }
  if (typeof d.content !== 'string') throw new Error('No file content')
  return Buffer.from(
    d.content,
    d.encoding === 'base64' ? 'base64' : 'utf8',
  ).toString('utf8')
}

export interface ListedEntry<T> {
  slug: string
  data: T
}

export async function listEntries<T extends Record<string, unknown>>(
  def: CollectionDef<T>,
  token: string,
  deps: ReadDeps = {},
): Promise<ListedEntry<T>[]> {
  const make = deps.makeOctokit ?? ((t: string) => new Octokit({ auth: t }))
  const octokit = make(token)
  const { owner, repo } = siteRepo()
  const dirRes = await octokit.repos.getContent({
    owner,
    repo,
    path: def.dir,
    ref: 'main',
  })
  const dirs = (dirRes.data as { name: string; type: string }[]).filter(
    (d) => d.type === 'dir',
  )
  const entries = await Promise.all(
    dirs.map(async (d) => {
      const fileRes = await octokit.repos.getContent({
        owner,
        repo,
        path: `${def.dir}/${d.name}/index.yaml`,
        ref: 'main',
      })
      const data = def.schema.parse(yamlParse(decode(fileRes.data)))
      return { slug: d.name, data }
    }),
  )
  return entries.sort((a, b) => Number(a.data.order) - Number(b.data.order))
}

export async function getEntry<T extends Record<string, unknown>>(
  def: CollectionDef<T>,
  slug: string,
  token: string,
  deps: ReadDeps = {},
): Promise<ListedEntry<T>> {
  const make = deps.makeOctokit ?? ((t: string) => new Octokit({ auth: t }))
  const octokit = make(token)
  const { owner, repo } = siteRepo()
  const fileRes = await octokit.repos.getContent({
    owner,
    repo,
    path: `${def.dir}/${slug}/index.yaml`,
    ref: 'main',
  })
  return { slug, data: def.schema.parse(yamlParse(decode(fileRes.data))) }
}

export async function readProfile(
  token: string,
  deps: ReadDeps = {},
): Promise<ProfileEntry> {
  const make = deps.makeOctokit ?? ((t: string) => new Octokit({ auth: t }))
  const octokit = make(token)
  const { owner, repo } = siteRepo()
  const fileRes = await octokit.repos.getContent({
    owner,
    repo,
    path: 'content/site/profile/index.yaml',
    ref: 'main',
  })
  return profileSchema.parse(yamlParse(decode(fileRes.data)))
}
```

- [ ] **Step 4: Run it (passes)**

Run: `cd apps/web && pnpm test content-read` → PASS. `cd apps/web && pnpm exec tsc --noEmit` → no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/admin/content-read.ts apps/web/lib/admin/content-read.test.ts
git commit -m "feat(admin): live GitHub content reader (Octokit + yaml + Zod)"
```

---

## Task 7: Route helpers

**Files:** Create `apps/web/lib/admin/content-api.ts`.

- [ ] **Step 1: Implement helpers**

`apps/web/lib/admin/content-api.ts`:

```ts
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  openToken,
  sealToken,
  ADMIN_GH_COOKIE,
  type AdminGithubToken,
} from './token-cookie'
import { getCollection, type CollectionDef } from './content-registry'
import type { CommitResult } from './git-write'

export async function getLinkedToken(): Promise<AdminGithubToken | null> {
  const jar = await cookies()
  const sealed = jar.get(ADMIN_GH_COOKIE)?.value
  return sealed ? openToken(sealed) : null
}

/** If a write refreshed the token, re-seal the cookie so the next request stays linked. */
export async function resealIfRefreshed(result: CommitResult): Promise<void> {
  if (!result.refreshed) return
  const jar = await cookies()
  jar.set(ADMIN_GH_COOKIE, sealToken(result.refreshed), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  })
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
) {
  return NextResponse.json({ error: { code, message, fields } }, { status })
}

export function resolveCollection(
  key: string,
): CollectionDef<Record<string, unknown>> | null {
  return getCollection(key)
}
```

- [ ] **Step 2: Type-check & commit**

Run: `cd apps/web && pnpm exec tsc --noEmit` → no errors.

```bash
git add apps/web/lib/admin/content-api.ts
git commit -m "feat(admin): content route helpers (token, reseal, errors, resolve)"
```

---

## Task 8: Routes — list + create (`[collection]`)

**Files:** Create `apps/web/app/api/admin/content/[collection]/route.ts`.

- [ ] **Step 1: Implement GET (list) + POST (create)**

`apps/web/app/api/admin/content/[collection]/route.ts`:

```ts
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { listEntries } from '@/lib/admin/content-read'
import { getEntry } from '@/lib/admin/content-read'
import { serializeEntry } from '@/lib/admin/content-yaml'
import { commitFile } from '@/lib/admin/git-write'
import {
  getLinkedToken,
  resolveCollection,
  jsonError,
  resealIfRefreshed,
} from '@/lib/admin/content-api'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ collection: string }> },
) {
  const { collection } = await ctx.params
  const def = resolveCollection(collection)
  if (!def) return jsonError(404, 'unknown_collection', 'Coleção desconhecida.')
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  try {
    const entries = await listEntries(def, auth.token)
    return NextResponse.json({ entries })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao ler do GitHub.', {
      detail: String(err),
    })
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ collection: string }> },
) {
  const { collection } = await ctx.params
  const def = resolveCollection(collection)
  if (!def) return jsonError(404, 'unknown_collection', 'Coleção desconhecida.')
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')

  const body = await req.json().catch(() => null)
  const parsed = def.schema.safeParse(body)
  if (!parsed.success) {
    const fields = Object.fromEntries(
      parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
    )
    return jsonError(400, 'validation', 'Dados inválidos.', fields)
  }
  const data = parsed.data as Record<string, unknown>
  const slug = String(data[def.slugField])

  // Reject if the slug already exists.
  try {
    await getEntry(def, slug, auth.token)
    return jsonError(
      409,
      'slug_exists',
      `Já existe um item com o slug "${slug}".`,
    )
  } catch {
    // not found → ok to create
  }

  const yaml = serializeEntry(def, data as never)
  try {
    const result = await commitFile(auth, {
      repo: 'site',
      path: `${def.dir}/${slug}/index.yaml`,
      content: yaml,
      message: `admin: cria ${def.label} ${slug}`,
    })
    await resealIfRefreshed(result)
    return NextResponse.json({ slug, data }, { status: 201 })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao gravar no GitHub.', {
      detail: String(err),
    })
  }
}
```

(The `cookies`/`z` imports may be unused depending on final code — remove any the linter flags. `getEntry` import is used for the slug-exists check.)

- [ ] **Step 2: Type-check & lint**

Run: `cd apps/web && pnpm exec tsc --noEmit` (no errors), `cd apps/web && pnpm lint` (clean — drop unused imports if flagged).

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/api/admin/content/[collection]/route.ts"
git commit -m "feat(admin): content list + create routes"
```

---

## Task 9: Routes — update + delete (`[collection]/[slug]`)

**Files:** Create `apps/web/app/api/admin/content/[collection]/[slug]/route.ts`.

- [ ] **Step 1: Implement PUT + DELETE**

`apps/web/app/api/admin/content/[collection]/[slug]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { serializeEntry } from '@/lib/admin/content-yaml'
import { commitFile, deleteFile } from '@/lib/admin/git-write'
import {
  getLinkedToken,
  resolveCollection,
  jsonError,
  resealIfRefreshed,
} from '@/lib/admin/content-api'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ collection: string; slug: string }> }

export async function PUT(req: Request, ctx: Ctx) {
  const { collection, slug } = await ctx.params
  const def = resolveCollection(collection)
  if (!def) return jsonError(404, 'unknown_collection', 'Coleção desconhecida.')
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')

  const body = await req.json().catch(() => null)
  const parsed = def.schema.safeParse(body)
  if (!parsed.success) {
    const fields = Object.fromEntries(
      parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
    )
    return jsonError(400, 'validation', 'Dados inválidos.', fields)
  }
  const data = parsed.data as Record<string, unknown>
  if (String(data[def.slugField]) !== slug) {
    return jsonError(
      400,
      'slug_immutable',
      'O slug não pode ser alterado ao editar.',
    )
  }
  try {
    const result = await commitFile(auth, {
      repo: 'site',
      path: `${def.dir}/${slug}/index.yaml`,
      content: serializeEntry(def, data as never),
      message: `admin: edita ${def.label} ${slug}`,
    })
    await resealIfRefreshed(result)
    return NextResponse.json({ slug, data })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao gravar no GitHub.', {
      detail: String(err),
    })
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { collection, slug } = await ctx.params
  const def = resolveCollection(collection)
  if (!def) return jsonError(404, 'unknown_collection', 'Coleção desconhecida.')
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  try {
    const result = await deleteFile(auth, {
      repo: 'site',
      path: `${def.dir}/${slug}/index.yaml`,
      message: `admin: remove ${def.label} ${slug}`,
    })
    await resealIfRefreshed(result)
    return NextResponse.json({ slug, deleted: true })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao remover no GitHub.', {
      detail: String(err),
    })
  }
}
```

- [ ] **Step 2: Type-check, lint, commit**

Run: `cd apps/web && pnpm exec tsc --noEmit` (no errors), `pnpm lint` (clean).

```bash
git add "apps/web/app/api/admin/content/[collection]/[slug]/route.ts"
git commit -m "feat(admin): content update + delete routes"
```

---

## Task 10: Route — reorder (`[collection]/reorder`)

**Files:** Create `apps/web/app/api/admin/content/[collection]/reorder/route.ts`.

- [ ] **Step 1: Implement POST reorder**

`apps/web/app/api/admin/content/[collection]/reorder/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { listEntries } from '@/lib/admin/content-read'
import { serializeEntry } from '@/lib/admin/content-yaml'
import { commitFiles } from '@/lib/admin/git-write'
import {
  getLinkedToken,
  resolveCollection,
  jsonError,
  resealIfRefreshed,
} from '@/lib/admin/content-api'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({ slugs: z.array(z.string()).min(1) })

export async function POST(
  req: Request,
  ctx: { params: Promise<{ collection: string }> },
) {
  const { collection } = await ctx.params
  const def = resolveCollection(collection)
  if (!def) return jsonError(404, 'unknown_collection', 'Coleção desconhecida.')
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success)
    return jsonError(400, 'validation', 'Lista de slugs inválida.')
  const { slugs } = parsed.data

  try {
    const current = await listEntries(def, auth.token)
    const bySlug = new Map(current.map((e) => [e.slug, e.data]))
    // Build one file per slug with its new order = index in the provided list.
    const files = slugs
      .map((slug, i) => {
        const data = bySlug.get(slug)
        if (!data) return null
        const next = { ...data, order: i }
        return {
          path: `${def.dir}/${slug}/index.yaml`,
          content: serializeEntry(def, next as never),
        }
      })
      .filter((f): f is { path: string; content: string } => f !== null)

    const result = await commitFiles(auth, {
      repo: 'site',
      message: `admin: reordena ${def.label}`,
      files,
    })
    await resealIfRefreshed(result)
    return NextResponse.json({ slugs })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao reordenar no GitHub.', {
      detail: String(err),
    })
  }
}
```

- [ ] **Step 2: Type-check, lint, commit**

Run: `cd apps/web && pnpm exec tsc --noEmit` (no errors), `pnpm lint` (clean).

```bash
git add "apps/web/app/api/admin/content/[collection]/reorder/route.ts"
git commit -m "feat(admin): content reorder route (atomic)"
```

---

## Task 11: Routes — profile singleton

**Files:** Create `apps/web/app/api/admin/content/profile/route.ts`.

- [ ] **Step 1: Implement GET + PUT**

`apps/web/app/api/admin/content/profile/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { readProfile } from '@/lib/admin/content-read'
import { profileSchema } from '@/lib/admin/content-schemas'
import { commitFile } from '@/lib/admin/git-write'
import {
  getLinkedToken,
  jsonError,
  resealIfRefreshed,
} from '@/lib/admin/content-api'
import { Document } from 'yaml'

export const dynamic = 'force-dynamic'

const KEY_ORDER = [
  'displayName',
  'avatarSrc',
  'avatarAlt',
  'roleHighlight',
  'companyName',
  'companyLink',
  'companyLinkColor',
  'bio',
  'availabilityOpen',
  'availabilityLabel',
  'location',
  'disciplines',
] as const

function serializeProfile(data: Record<string, unknown>): string {
  const doc = new Document({})
  doc.contents = doc.createNode({}) as never
  for (const key of KEY_ORDER) {
    // @ts-expect-error YAMLMap.set
    doc.contents.set(key, doc.createNode(data[key]))
  }
  return doc.toString({ lineWidth: 80 })
}

export async function GET() {
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  try {
    return NextResponse.json({ data: await readProfile(auth.token) })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao ler o perfil.', {
      detail: String(err),
    })
  }
}

export async function PUT(req: Request) {
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  const parsed = profileSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const fields = Object.fromEntries(
      parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
    )
    return jsonError(400, 'validation', 'Dados inválidos.', fields)
  }
  try {
    const result = await commitFile(auth, {
      repo: 'site',
      path: 'content/site/profile/index.yaml',
      content: serializeProfile(parsed.data as Record<string, unknown>),
      message: 'admin: edita perfil',
    })
    await resealIfRefreshed(result)
    return NextResponse.json({ data: parsed.data })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao gravar o perfil.', {
      detail: String(err),
    })
  }
}
```

- [ ] **Step 2: Type-check, lint, commit**

Run: `cd apps/web && pnpm exec tsc --noEmit` (no errors), `pnpm lint` (clean).

```bash
git add "apps/web/app/api/admin/content/profile/route.ts"
git commit -m "feat(admin): profile singleton routes"
```

---

# Phase B — Shared UI + hooks

## Task 12: Field primitives + tag input + FA icon select

**Files:** Create `apps/web/components/admin/content/fields.tsx` (+ `.stories.tsx`), `tag-array-input.tsx` (+ `.stories.tsx`), `fa-icon-select.tsx` (+ `.stories.tsx`).

- [ ] **Step 1: `fields.tsx` (text/textarea/select/toggle — native, DS V2)**

`apps/web/components/admin/content/fields.tsx`:

```tsx
'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const inputCls =
  'border-border bg-muted/40 text-foreground placeholder:text-muted-foreground w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary'

export function FieldShell({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
      {error ? <span className="text-warn text-xs">{error}</span> : null}
    </label>
  )
}

export function TextField(props: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  error?: string
}) {
  return (
    <FieldShell label={props.label} error={props.error}>
      <input
        className={inputCls}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </FieldShell>
  )
}

export function TextareaField(props: {
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
  error?: string
}) {
  return (
    <FieldShell label={props.label} error={props.error}>
      <textarea
        className={cn(inputCls, 'min-h-24 resize-y')}
        rows={props.rows ?? 4}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </FieldShell>
  )
}

export function SelectField(props: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { label: string; value: string }[]
  error?: string
}) {
  return (
    <FieldShell label={props.label} error={props.error}>
      <select
        className={inputCls}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

export function ToggleField(props: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-muted-foreground text-sm">{props.label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        onClick={() => props.onChange(!props.checked)}
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors',
          props.checked ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'bg-background absolute top-0.5 size-5 rounded-full transition-transform',
            props.checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: `tag-array-input.tsx`**

`apps/web/components/admin/content/tag-array-input.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { FieldShell } from './fields'

export function TagArrayInput(props: {
  label: string
  values: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const t = draft.trim()
    if (t && !props.values.includes(t)) props.onChange([...props.values, t])
    setDraft('')
  }
  return (
    <FieldShell label={props.label}>
      <div className="border-border bg-muted/40 flex flex-wrap gap-2 rounded-lg border p-2">
        {props.values.map((v) => (
          <span
            key={v}
            className="bg-accent-soft text-primary rounded-pill inline-flex items-center gap-1 px-2 py-0.5 text-xs"
          >
            {v}
            <button
              type="button"
              aria-label={`Remover ${v}`}
              onClick={() =>
                props.onChange(props.values.filter((x) => x !== v))
              }
            >
              <FontAwesomeIcon icon={faXmark} className="size-3" />
            </button>
          </span>
        ))}
        <input
          className="text-foreground min-w-24 flex-1 bg-transparent text-sm outline-none"
          value={draft}
          placeholder={props.placeholder ?? 'Adicionar…'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          onBlur={add}
        />
      </div>
    </FieldShell>
  )
}
```

- [ ] **Step 3: `fa-icon-select.tsx`**

`apps/web/components/admin/content/fa-icon-select.tsx`:

```tsx
'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  VISIT_CARD_FA_SELECT_OPTIONS,
  VISIT_CARD_FA_ICON_MAP,
} from '@/lib/visit-card-fontawesome'
import { SelectField } from './fields'

export function FaIconSelect(props: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const icon = VISIT_CARD_FA_ICON_MAP[props.value]
  return (
    <div className="flex items-end gap-3">
      <div className="flex-1">
        <SelectField
          label={props.label}
          value={props.value}
          onChange={props.onChange}
          options={VISIT_CARD_FA_SELECT_OPTIONS}
        />
      </div>
      <div className="bg-accent-soft text-primary grid size-10 place-items-center rounded-lg">
        {icon ? <FontAwesomeIcon icon={icon} className="size-5" /> : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Stories**

`apps/web/components/admin/content/fields.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { useState } from 'react'
import { TextField, TextareaField, SelectField, ToggleField } from './fields'

const meta: Meta = {
  title: 'Admin/Content/Fields',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

export const AllFields: Story = {
  render: () => {
    const [t, setT] = useState('Live PRs')
    const [a, setA] = useState('desc')
    const [s, setS] = useState('#14b8a6')
    const [on, setOn] = useState(true)
    return (
      <div className="flex max-w-md flex-col gap-4">
        <TextField label="Nome" value={t} onChange={setT} />
        <TextareaField label="Descrição" value={a} onChange={setA} />
        <SelectField
          label="Cor"
          value={s}
          onChange={setS}
          options={[
            { label: 'Verde água', value: '#14b8a6' },
            { label: 'Ciano', value: '#06b6d4' },
          ]}
        />
        <ToggleField
          label="Disponível para oportunidades"
          checked={on}
          onChange={setOn}
        />
      </div>
    )
  },
}
```

`apps/web/components/admin/content/tag-array-input.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { useState } from 'react'
import { TagArrayInput } from './tag-array-input'

const meta: Meta<typeof TagArrayInput> = {
  title: 'Admin/Content/TagArrayInput',
  component: TagArrayInput,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof TagArrayInput>
export const Default: Story = {
  render: () => {
    const [v, setV] = useState(['React', 'Go'])
    return (
      <div className="max-w-md">
        <TagArrayInput label="Tags" values={v} onChange={setV} />
      </div>
    )
  },
}
```

`apps/web/components/admin/content/fa-icon-select.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { useState } from 'react'
import { FaIconSelect } from './fa-icon-select'

const meta: Meta<typeof FaIconSelect> = {
  title: 'Admin/Content/FaIconSelect',
  component: FaIconSelect,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof FaIconSelect>
export const Default: Story = {
  render: () => {
    const [v, setV] = useState('brands__github')
    return (
      <div className="max-w-md">
        <FaIconSelect label="Ícone" value={v} onChange={setV} />
      </div>
    )
  },
}
```

- [ ] **Step 5: Type-check, lint, commit**

Run: `cd apps/web && pnpm exec tsc --noEmit` (no errors), `pnpm lint` (clean).

```bash
git add apps/web/components/admin/content/fields.tsx apps/web/components/admin/content/fields.stories.tsx apps/web/components/admin/content/tag-array-input.tsx apps/web/components/admin/content/tag-array-input.stories.tsx apps/web/components/admin/content/fa-icon-select.tsx apps/web/components/admin/content/fa-icon-select.stories.tsx
git commit -m "feat(admin): content field primitives + tag input + FA icon select"
```

---

## Task 13: Delete-confirm dialog + sortable list

**Files:** Create `apps/web/components/admin/content/delete-confirm-dialog.tsx` (+ `.stories.tsx`), `sortable-list.tsx` (+ `.stories.tsx`).

- [ ] **Step 1: `delete-confirm-dialog.tsx`** (uses existing shadcn `dialog.tsx`)

`apps/web/components/admin/content/delete-confirm-dialog.tsx`:

```tsx
'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function DeleteConfirmDialog(props: {
  open: boolean
  onOpenChange: (o: boolean) => void
  itemLabel: string
  onConfirm: () => void
  pending?: boolean
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remover “{props.itemLabel}”?</DialogTitle>
          <DialogDescription>
            Isso comita a remoção na main e dispara um deploy. Não dá pra
            desfazer pelo admin.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={props.pending}
            onClick={props.onConfirm}
          >
            {props.pending ? 'Removendo…' : 'Remover'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

> If `dialog.tsx` doesn't export `DialogDescription`/`DialogFooter`, check `components/ui/dialog.tsx` and use the names it exports (shadcn exports these by default). If `Button` has no `destructive` variant, use `className="bg-warn text-warn-foreground"`.

- [ ] **Step 2: `sortable-list.tsx`** (dnd-kit wrapper)

`apps/web/components/admin/content/sortable-list.tsx`:

```tsx
'use client'

import type { ReactNode } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing"
    >
      {children}
    </div>
  )
}

/** Renders `items` in order; on drop, calls onReorder with the new slug order. */
export function SortableList<T extends { slug: string }>(props: {
  items: T[]
  onReorder: (slugs: string[]) => void
  renderItem: (item: T) => ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = props.items.findIndex((i) => i.slug === active.id)
    const newIndex = props.items.findIndex((i) => i.slug === over.id)
    props.onReorder(
      arrayMove(props.items, oldIndex, newIndex).map((i) => i.slug),
    )
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={props.items.map((i) => i.slug)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-3">
          {props.items.map((item) => (
            <SortableRow key={item.slug} id={item.slug}>
              {props.renderItem(item)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
```

- [ ] **Step 3: Stories**

`apps/web/components/admin/content/delete-confirm-dialog.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { DeleteConfirmDialog } from './delete-confirm-dialog'

const meta: Meta<typeof DeleteConfirmDialog> = {
  title: 'Admin/Content/DeleteConfirmDialog',
  component: DeleteConfirmDialog,
  tags: ['autodocs'],
  args: {
    open: true,
    onOpenChange: fn(),
    onConfirm: fn(),
    itemLabel: 'Live PRs',
  },
}
export default meta
type Story = StoryObj<typeof DeleteConfirmDialog>
export const Open: Story = {}
```

`apps/web/components/admin/content/sortable-list.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { useState } from 'react'
import { SortableList } from './sortable-list'

const meta: Meta = {
  title: 'Admin/Content/SortableList',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => {
    const [items, setItems] = useState([
      { slug: 'a' },
      { slug: 'b' },
      { slug: 'c' },
    ])
    return (
      <SortableList
        items={items}
        onReorder={(slugs) => setItems(slugs.map((s) => ({ slug: s })))}
        renderItem={(i) => (
          <div className="border-border bg-card rounded-lg border px-4 py-3">
            {i.slug}
          </div>
        )}
      />
    )
  },
}
```

- [ ] **Step 4: Type-check, lint, commit**

Run: `cd apps/web && pnpm exec tsc --noEmit` (no errors), `pnpm lint` (clean).

```bash
git add apps/web/components/admin/content/delete-confirm-dialog.tsx apps/web/components/admin/content/delete-confirm-dialog.stories.tsx apps/web/components/admin/content/sortable-list.tsx apps/web/components/admin/content/sortable-list.stories.tsx
git commit -m "feat(admin): delete-confirm dialog + sortable list"
```

---

## Task 14: Content hooks (TanStack Query, optimistic)

**Files:** Create `apps/web/hooks/admin/content/use-content-list.ts`, `use-content-mutations.ts`, `use-profile.ts`.

- [ ] **Step 1: `use-content-list.ts`**

`apps/web/hooks/admin/content/use-content-list.ts`:

```ts
'use client'

import { useQuery } from '@tanstack/react-query'
import type { CollectionKey } from '@/lib/admin/content-registry'

export interface ListedEntry<T = Record<string, unknown>> {
  slug: string
  data: T
}

export function useContentList<T = Record<string, unknown>>(
  collection: CollectionKey,
) {
  return useQuery({
    queryKey: ['admin', 'content', collection],
    queryFn: async (): Promise<ListedEntry<T>[]> => {
      const res = await fetch(`/api/admin/content/${collection}`)
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => ({})))?.error?.message ??
            'Falha ao listar',
        )
      return (await res.json()).entries
    },
    staleTime: 15_000,
  })
}
```

- [ ] **Step 2: `use-content-mutations.ts`** (create/update/delete/reorder with optimistic cache)

`apps/web/hooks/admin/content/use-content-mutations.ts`:

```ts
'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CollectionKey } from '@/lib/admin/content-registry'
import type { ListedEntry } from './use-content-list'

async function jsonOrThrow(res: Response) {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error?.message ?? 'Falha na operação')
  return body
}

export function useContentMutations(collection: CollectionKey) {
  const qc = useQueryClient()
  const key = ['admin', 'content', collection]

  const create = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch(`/api/admin/content/${collection}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const update = useMutation({
    mutationFn: ({
      slug,
      data,
    }: {
      slug: string
      data: Record<string, unknown>
    }) =>
      fetch(`/api/admin/content/${collection}/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  const remove = useMutation({
    mutationFn: (slug: string) =>
      fetch(`/api/admin/content/${collection}/${slug}`, {
        method: 'DELETE',
      }).then(jsonOrThrow),
    onMutate: async (slug) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<ListedEntry[]>(key)
      qc.setQueryData<ListedEntry[]>(key, (old) =>
        (old ?? []).filter((e) => e.slug !== slug),
      )
      return { prev }
    },
    onError: (_e, _slug, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  const reorder = useMutation({
    mutationFn: (slugs: string[]) =>
      fetch(`/api/admin/content/${collection}/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slugs }),
      }).then(jsonOrThrow),
    onMutate: async (slugs) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<ListedEntry[]>(key)
      qc.setQueryData<ListedEntry[]>(key, (old) => {
        const bySlug = new Map((old ?? []).map((e) => [e.slug, e]))
        return slugs.map((s) => bySlug.get(s)).filter(Boolean) as ListedEntry[]
      })
      return { prev }
    },
    onError: (_e, _slugs, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  return { create, update, remove, reorder }
}
```

- [ ] **Step 3: `use-profile.ts`**

`apps/web/hooks/admin/content/use-profile.ts`:

```ts
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProfileEntry } from '@/lib/admin/content-schemas'

const key = ['admin', 'content', 'profile']

export function useProfile() {
  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<ProfileEntry> => {
      const res = await fetch('/api/admin/content/profile')
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => ({})))?.error?.message ??
            'Falha ao ler perfil',
        )
      return (await res.json()).data
    },
    staleTime: 15_000,
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ProfileEntry) =>
      fetch('/api/admin/content/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error?.message ?? 'Falha ao salvar')
        return body
      }),
    onSuccess: (body) => qc.setQueryData(key, body.data),
  })
}
```

- [ ] **Step 4: Type-check, lint, commit**

Run: `cd apps/web && pnpm exec tsc --noEmit` (no errors), `pnpm lint` (clean).

```bash
git add apps/web/hooks/admin/content/
git commit -m "feat(admin): content list/mutation/profile hooks (optimistic)"
```

---

# Phase C — The 4 surfaces

> Each surface: a form component (modal body), a list component, a page. Forms hold a local draft, validate with the Zod schema on submit (show `fieldErrors`), and call the mutation; on success `toast.success` + close; on error `toast.error(err.message)`. New entries: slug auto-derived from the name via `slugify`, shown in an editable field, **disabled when editing**.

## Task 15: Projetos surface

**Files:** Create `apps/web/components/admin/content/project-form.tsx` (+ `.stories.tsx`), `project-list.tsx` (+ `.stories.tsx`), `apps/web/app/(admin)/admin/projetos/page.tsx`, `apps/web/app/(admin)/admin/projetos/projetos.e2e.ts`.

- [ ] **Step 1: `project-form.tsx`**

`apps/web/components/admin/content/project-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { projectSchema, type ProjectEntry } from '@/lib/admin/content-schemas'
import { slugify } from '@/lib/admin/slugify'
import { TextField, TextareaField } from './fields'
import { TagArrayInput } from './tag-array-input'

const EMPTY: ProjectEntry = {
  projectSlug: '',
  order: 0,
  projectName: '',
  subtitle: '',
  projectLogo: '',
  description: '',
  tags: [],
  deployLink: '',
  repoLink: '',
  image: '',
  altImage: '',
}

export function ProjectForm(props: {
  initial?: ProjectEntry
  onSubmit: (data: ProjectEntry) => void
  pending?: boolean
}) {
  const isEdit = !!props.initial
  const [d, setD] = useState<ProjectEntry>(props.initial ?? EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof ProjectEntry>(k: K, v: ProjectEntry[K]) =>
    setD((p) => ({ ...p, [k]: v }))

  const submit = () => {
    const candidate = isEdit
      ? d
      : { ...d, projectSlug: d.projectSlug || slugify(d.projectName) }
    const parsed = projectSchema.safeParse(candidate)
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
        ),
      )
      return
    }
    setErrors({})
    props.onSubmit(parsed.data)
  }

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label="Nome"
        value={d.projectName}
        onChange={(v) => set('projectName', v)}
        error={errors.projectName}
      />
      <TextField
        label="Slug"
        value={isEdit ? d.projectSlug : d.projectSlug || slugify(d.projectName)}
        onChange={(v) => set('projectSlug', v)}
        error={errors.projectSlug}
      />
      <TextField
        label="Subtítulo"
        value={d.subtitle}
        onChange={(v) => set('subtitle', v)}
      />
      <TextField
        label="Logo (path)"
        value={d.projectLogo}
        onChange={(v) => set('projectLogo', v)}
      />
      <TextareaField
        label="Descrição"
        value={d.description}
        onChange={(v) => set('description', v)}
      />
      <TagArrayInput
        label="Tags"
        values={d.tags}
        onChange={(v) => set('tags', v)}
      />
      <TextField
        label="Deploy (URL)"
        value={d.deployLink}
        onChange={(v) => set('deployLink', v)}
      />
      <TextField
        label="Repo (URL)"
        value={d.repoLink}
        onChange={(v) => set('repoLink', v)}
      />
      <TextField
        label="Imagem de capa (path)"
        value={d.image}
        onChange={(v) => set('image', v)}
      />
      <TextField
        label="Alt / abrev."
        value={d.altImage}
        onChange={(v) => set('altImage', v)}
      />
      <div className="flex justify-end">
        <Button onClick={submit} disabled={props.pending}>
          {props.pending ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
    </div>
  )
}
```

> Note: the disabled-slug-on-edit is enforced server-side (`slug_immutable`); the form keeps the slug field editable visually but the page passes `initial.projectSlug` unchanged. If you prefer, add `readOnly` to the slug input when `isEdit`.

- [ ] **Step 2: `project-list.tsx`** (cards, drag, edit/delete actions)

`apps/web/components/admin/content/project-list.tsx`:

```tsx
'use client'

import type { ProjectEntry } from '@/lib/admin/content-schemas'
import { SortableList } from './sortable-list'

export function ProjectList(props: {
  entries: { slug: string; data: ProjectEntry }[]
  onReorder: (slugs: string[]) => void
  onEdit: (slug: string) => void
  onDelete: (slug: string) => void
}) {
  return (
    <SortableList
      items={props.entries}
      onReorder={props.onReorder}
      renderItem={(e) => (
        <div className="border-border bg-card shadow-ds flex items-center justify-between gap-4 rounded-[var(--radius)] border px-5 py-4">
          <div className="min-w-0">
            <p className="truncate font-semibold">{e.data.projectName}</p>
            <p className="text-muted-foreground truncate text-sm">
              {e.data.subtitle || e.slug}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              className="text-primary text-sm"
              onClick={() => props.onEdit(e.slug)}
            >
              Editar
            </button>
            <button
              className="text-warn text-sm"
              onClick={() => props.onDelete(e.slug)}
            >
              Remover
            </button>
          </div>
        </div>
      )}
    />
  )
}
```

- [ ] **Step 3: `projetos/page.tsx`** (wires list + modal + hooks)

`apps/web/app/(admin)/admin/projetos/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionHeader } from '@/components/section-header'
import { useContentList } from '@/hooks/admin/content/use-content-list'
import { useContentMutations } from '@/hooks/admin/content/use-content-mutations'
import { ProjectForm } from '@/components/admin/content/project-form'
import { ProjectList } from '@/components/admin/content/project-list'
import { DeleteConfirmDialog } from '@/components/admin/content/delete-confirm-dialog'
import type { ProjectEntry } from '@/lib/admin/content-schemas'

export default function ProjetosPage() {
  const list = useContentList<ProjectEntry>('projects')
  const { create, update, remove, reorder } = useContentMutations('projects')
  const [editing, setEditing] = useState<{
    slug: string
    data: ProjectEntry
  } | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const entries = list.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader label="Projetos" count={entries.length} />
        <Button onClick={() => setCreating(true)}>+ Novo projeto</Button>
      </div>

      {list.isLoading ? (
        <Skeleton className="h-40 w-full rounded-[var(--radius)]" />
      ) : list.isError ? (
        <p className="text-warn text-sm">{(list.error as Error).message}</p>
      ) : (
        <ProjectList
          entries={entries}
          onReorder={(slugs) =>
            reorder.mutate(slugs, {
              onError: (e) => toast.error((e as Error).message),
            })
          }
          onEdit={(slug) => {
            const e = entries.find((x) => x.slug === slug)
            if (e) setEditing(e)
          }}
          onDelete={(slug) => setDeleting(slug)}
        />
      )}

      <Dialog
        open={creating || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false)
            setEditing(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar projeto' : 'Novo projeto'}
            </DialogTitle>
          </DialogHeader>
          <ProjectForm
            initial={editing?.data}
            pending={create.isPending || update.isPending}
            onSubmit={(data) => {
              const onDone = {
                onSuccess: () => {
                  toast.success('Salvo')
                  setCreating(false)
                  setEditing(null)
                },
                onError: (e: unknown) => toast.error((e as Error).message),
              }
              if (editing) update.mutate({ slug: editing.slug, data }, onDone)
              else create.mutate(data, onDone)
            }}
          />
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null)
        }}
        itemLabel={
          entries.find((e) => e.slug === deleting)?.data.projectName ??
          deleting ??
          ''
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

- [ ] **Step 4: Stories** (form + list)

`apps/web/components/admin/content/project-form.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { ProjectForm } from './project-form'

const meta: Meta<typeof ProjectForm> = {
  title: 'Admin/Content/ProjectForm',
  component: ProjectForm,
  tags: ['autodocs'],
  args: { onSubmit: fn() },
}
export default meta
type Story = StoryObj<typeof ProjectForm>
export const New: Story = {}
export const Editing: Story = {
  args: {
    initial: {
      projectSlug: 'live-prs',
      order: 0,
      projectName: 'Live PRs',
      subtitle: 'agregador',
      projectLogo: '/x.svg',
      description: 'desc',
      tags: ['Go'],
      deployLink: 'https://x',
      repoLink: '',
      image: '/i.png',
      altImage: 'LPR',
    },
  },
}
```

`apps/web/components/admin/content/project-list.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { ProjectList } from './project-list'

const meta: Meta<typeof ProjectList> = {
  title: 'Admin/Content/ProjectList',
  component: ProjectList,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { onReorder: fn(), onEdit: fn(), onDelete: fn() },
}
export default meta
type Story = StoryObj<typeof ProjectList>
export const Default: Story = {
  args: {
    entries: [
      {
        slug: 'live-prs',
        data: {
          projectSlug: 'live-prs',
          order: 0,
          projectName: 'Live PRs',
          subtitle: 'agregador',
          projectLogo: '',
          description: '',
          tags: [],
          deployLink: '',
          repoLink: '',
          image: '',
          altImage: '',
        },
      },
    ],
  },
}
```

- [ ] **Step 5: E2E** (`projetos.e2e.ts`)

`apps/web/app/(admin)/admin/projetos/projetos.e2e.ts`:

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
const project = {
  projectSlug: 'live-prs',
  order: 0,
  projectName: 'Live PRs',
  subtitle: 'agregador',
  projectLogo: '',
  description: '',
  tags: [],
  deployLink: '',
  repoLink: '',
  image: '',
  altImage: '',
}

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
        projects: 1,
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
  await page.route('**/api/admin/content/projects', (r) => {
    if (r.request().method() === 'POST')
      return r.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ slug: 'novo', data: {} }),
      })
    return r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ entries: [{ slug: 'live-prs', data: project }] }),
    })
  })
}

test('lists projects and opens the create modal', async ({ page }) => {
  await baseMocks(page)
  await page.goto('/admin/projetos')
  await expect(page.getByText('Live PRs')).toBeVisible()
  await page.getByRole('button', { name: '+ Novo projeto' }).click()
  await expect(
    page.getByRole('heading', { name: 'Novo projeto' }),
  ).toBeVisible()
})

test('creates a project (asserts POST body)', async ({ page }) => {
  await baseMocks(page)
  let posted: unknown = null
  await page.route('**/api/admin/content/projects', async (r) => {
    if (r.request().method() === 'POST') {
      posted = r.request().postDataJSON()
      return r.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ slug: 'meu-app', data: {} }),
      })
    }
    return r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ entries: [] }),
    })
  })
  await page.goto('/admin/projetos')
  await page.getByRole('button', { name: '+ Novo projeto' }).click()
  await page.getByLabel('Nome').fill('Meu App')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect
    .poll(() => (posted as { projectName?: string })?.projectName)
    .toBe('Meu App')
})
```

> `getByLabel('Nome')` works because `FieldShell` wraps the input in a `<label>` with the text. If Playwright can't resolve it, switch to `page.getByText('Nome').locator('..').getByRole('textbox')` and report.

- [ ] **Step 6: Run E2E, type-check, lint, commit**

Run: `cd apps/web && pnpm test:e2e projetos.e2e.ts` → 2 passed. `pnpm exec tsc --noEmit` (no errors), `pnpm lint` (clean).

```bash
git add apps/web/components/admin/content/project-form.tsx apps/web/components/admin/content/project-form.stories.tsx apps/web/components/admin/content/project-list.tsx apps/web/components/admin/content/project-list.stories.tsx "apps/web/app/(admin)/admin/projetos"
git commit -m "feat(admin): Projetos surface (list, form, page, E2E)"
```

---

## Task 16: Carreira surface

**Files:** Create `apps/web/components/admin/content/carreira-form.tsx` (+ `.stories.tsx`), `carreira-list.tsx` (+ `.stories.tsx`), `apps/web/app/(admin)/admin/carreira/page.tsx`, `apps/web/app/(admin)/admin/carreira/carreira.e2e.ts`.

- [ ] **Step 1: `carreira-form.tsx`**

`apps/web/components/admin/content/carreira-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { carreiraSchema, type CarreiraEntry } from '@/lib/admin/content-schemas'
import { slugify } from '@/lib/admin/slugify'
import { TextField, TextareaField, ToggleField } from './fields'
import { TagArrayInput } from './tag-array-input'

const EMPTY: CarreiraEntry = {
  orgSlug: '',
  order: 0,
  orgName: '',
  orgDescription: '',
  orgLink: '',
  image: '',
  altImage: '',
  title: '',
  location: '',
  date: '',
  atribuitions: [],
  current: false,
  tags: [],
}

export function CarreiraForm(props: {
  initial?: CarreiraEntry
  onSubmit: (d: CarreiraEntry) => void
  pending?: boolean
}) {
  const isEdit = !!props.initial
  const [d, setD] = useState<CarreiraEntry>(props.initial ?? EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof CarreiraEntry>(k: K, v: CarreiraEntry[K]) =>
    setD((p) => ({ ...p, [k]: v }))

  const submit = () => {
    const candidate = isEdit
      ? d
      : { ...d, orgSlug: d.orgSlug || slugify(d.orgName) }
    const parsed = carreiraSchema.safeParse(candidate)
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
        ),
      )
      return
    }
    setErrors({})
    props.onSubmit(parsed.data)
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
      <TextField
        label="Organização"
        value={d.orgName}
        onChange={(v) => set('orgName', v)}
        error={errors.orgName}
      />
      <TextField
        label="Slug"
        value={isEdit ? d.orgSlug : d.orgSlug || slugify(d.orgName)}
        onChange={(v) => set('orgSlug', v)}
        error={errors.orgSlug}
      />
      <TextField
        label="Cargo"
        value={d.title}
        onChange={(v) => set('title', v)}
      />
      <TextField
        label="Período"
        value={d.date}
        onChange={(v) => set('date', v)}
      />
      <TextField
        label="Localização"
        value={d.location}
        onChange={(v) => set('location', v)}
      />
      <TextareaField
        label="Descrição"
        value={d.orgDescription}
        onChange={(v) => set('orgDescription', v)}
      />
      <TextField
        label="Link"
        value={d.orgLink}
        onChange={(v) => set('orgLink', v)}
      />
      <TextField
        label="Logo (URL)"
        value={d.image}
        onChange={(v) => set('image', v)}
      />
      <TextField
        label="Alt / iniciais"
        value={d.altImage}
        onChange={(v) => set('altImage', v)}
      />
      <TagArrayInput
        label="Atribuições"
        values={d.atribuitions}
        onChange={(v) => set('atribuitions', v)}
        placeholder="Adicionar atribuição…"
      />
      <TagArrayInput
        label="Tags"
        values={d.tags}
        onChange={(v) => set('tags', v)}
      />
      <ToggleField
        label="Cargo atual"
        checked={d.current}
        onChange={(v) => set('current', v)}
      />
      <div className="flex justify-end">
        <Button onClick={submit} disabled={props.pending}>
          {props.pending ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `carreira-list.tsx`** (table-style rows, drag)

`apps/web/components/admin/content/carreira-list.tsx`:

```tsx
'use client'

import type { CarreiraEntry } from '@/lib/admin/content-schemas'
import { SortableList } from './sortable-list'

export function CarreiraList(props: {
  entries: { slug: string; data: CarreiraEntry }[]
  onReorder: (slugs: string[]) => void
  onEdit: (slug: string) => void
  onDelete: (slug: string) => void
}) {
  return (
    <div className="space-y-2">
      <div className="text-muted-foreground grid grid-cols-[2fr_2fr_1.5fr_1fr_auto] gap-4 px-5 font-mono text-xs uppercase">
        <span>Empresa</span>
        <span>Cargo</span>
        <span>Período</span>
        <span>Status</span>
        <span />
      </div>
      <SortableList
        items={props.entries}
        onReorder={props.onReorder}
        renderItem={(e) => (
          <div className="border-border bg-card grid grid-cols-[2fr_2fr_1.5fr_1fr_auto] items-center gap-4 rounded-[var(--radius)] border px-5 py-3">
            <span className="truncate font-medium">{e.data.orgName}</span>
            <span className="text-muted-foreground truncate text-sm">
              {e.data.title}
            </span>
            <span className="text-muted-foreground truncate font-mono text-xs">
              {e.data.date}
            </span>
            <span>
              <span
                className={
                  e.data.current
                    ? 'text-ok text-xs'
                    : 'text-muted-foreground text-xs'
                }
              >
                {e.data.current ? '● Atual' : 'Encerrado'}
              </span>
            </span>
            <span className="flex gap-2">
              <button
                className="text-primary text-sm"
                onClick={() => props.onEdit(e.slug)}
              >
                Editar
              </button>
              <button
                className="text-warn text-sm"
                onClick={() => props.onDelete(e.slug)}
              >
                Remover
              </button>
            </span>
          </div>
        )}
      />
    </div>
  )
}
```

- [ ] **Step 3: `carreira/page.tsx`**

Same structure as `projetos/page.tsx` but for `'carreiras'` + `CarreiraForm`/`CarreiraList`, label "Carreira", button "+ Nova experiência", delete label `orgName`:

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionHeader } from '@/components/section-header'
import { useContentList } from '@/hooks/admin/content/use-content-list'
import { useContentMutations } from '@/hooks/admin/content/use-content-mutations'
import { CarreiraForm } from '@/components/admin/content/carreira-form'
import { CarreiraList } from '@/components/admin/content/carreira-list'
import { DeleteConfirmDialog } from '@/components/admin/content/delete-confirm-dialog'
import type { CarreiraEntry } from '@/lib/admin/content-schemas'

export default function CarreiraPage() {
  const list = useContentList<CarreiraEntry>('carreiras')
  const { create, update, remove, reorder } = useContentMutations('carreiras')
  const [editing, setEditing] = useState<{
    slug: string
    data: CarreiraEntry
  } | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const entries = list.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader label="Carreira" count={entries.length} />
        <Button onClick={() => setCreating(true)}>+ Nova experiência</Button>
      </div>
      {list.isLoading ? (
        <Skeleton className="h-40 w-full rounded-[var(--radius)]" />
      ) : list.isError ? (
        <p className="text-warn text-sm">{(list.error as Error).message}</p>
      ) : (
        <CarreiraList
          entries={entries}
          onReorder={(s) =>
            reorder.mutate(s, {
              onError: (e) => toast.error((e as Error).message),
            })
          }
          onEdit={(slug) => {
            const e = entries.find((x) => x.slug === slug)
            if (e) setEditing(e)
          }}
          onDelete={(slug) => setDeleting(slug)}
        />
      )}

      <Dialog
        open={creating || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false)
            setEditing(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar experiência' : 'Nova experiência'}
            </DialogTitle>
          </DialogHeader>
          <CarreiraForm
            initial={editing?.data}
            pending={create.isPending || update.isPending}
            onSubmit={(data) => {
              const onDone = {
                onSuccess: () => {
                  toast.success('Salvo')
                  setCreating(false)
                  setEditing(null)
                },
                onError: (e: unknown) => toast.error((e as Error).message),
              }
              if (editing) update.mutate({ slug: editing.slug, data }, onDone)
              else create.mutate(data, onDone)
            }}
          />
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null)
        }}
        itemLabel={
          entries.find((e) => e.slug === deleting)?.data.orgName ??
          deleting ??
          ''
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

- [ ] **Step 4: Stories** (form New + Editing; list Default) — mirror Task 15's stories with carreira data (full objects, no "similar to" shortcuts). Create `carreira-form.stories.tsx` and `carreira-list.stories.tsx` with a populated `CarreiraEntry` (orgSlug/order/orgName/orgDescription/orgLink/image/altImage/title/location/date/atribuitions/current/tags).

- [ ] **Step 5: E2E** (`carreira.e2e.ts`) — mirror Task 15's E2E against `**/api/admin/content/carreiras`, asserting the list shows an org name and the "+ Nova experiência" modal opens; POST body assert on create with `orgName`.

- [ ] **Step 6: Run E2E, type-check, lint, commit**

Run: `cd apps/web && pnpm test:e2e carreira.e2e.ts`, `pnpm exec tsc --noEmit`, `pnpm lint`.

```bash
git add apps/web/components/admin/content/carreira-form.tsx apps/web/components/admin/content/carreira-form.stories.tsx apps/web/components/admin/content/carreira-list.tsx apps/web/components/admin/content/carreira-list.stories.tsx "apps/web/app/(admin)/admin/carreira"
git commit -m "feat(admin): Carreira surface (table, form, page, E2E)"
```

---

## Task 17: Socials surface

**Files:** Create `apps/web/components/admin/content/social-form.tsx` (+ `.stories.tsx`), `social-list.tsx` (+ `.stories.tsx`), `apps/web/app/(admin)/admin/socials/page.tsx`, `apps/web/app/(admin)/admin/socials/socials.e2e.ts`.

- [ ] **Step 1: `social-form.tsx`** (uses the FA icon picker + iconMode select)

`apps/web/components/admin/content/social-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { socialSchema, type SocialEntry } from '@/lib/admin/content-schemas'
import { slugify } from '@/lib/admin/slugify'
import { TextField, SelectField } from './fields'
import { FaIconSelect } from './fa-icon-select'

const EMPTY: SocialEntry = {
  key: '',
  order: 0,
  socialDescription: '',
  socialLink: '',
  iconMode: 'fontawesome',
  fontawesomeIcon: 'brands__github',
  image: '',
  altImage: '',
}

export function SocialForm(props: {
  initial?: SocialEntry
  onSubmit: (d: SocialEntry) => void
  pending?: boolean
}) {
  const isEdit = !!props.initial
  const [d, setD] = useState<SocialEntry>(props.initial ?? EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof SocialEntry>(k: K, v: SocialEntry[K]) =>
    setD((p) => ({ ...p, [k]: v }))

  const submit = () => {
    const candidate = isEdit
      ? d
      : { ...d, key: d.key || slugify(d.socialDescription) }
    const parsed = socialSchema.safeParse(candidate)
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
        ),
      )
      return
    }
    setErrors({})
    props.onSubmit(parsed.data)
  }

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label="Identificador (slug)"
        value={isEdit ? d.key : d.key || slugify(d.socialDescription)}
        onChange={(v) => set('key', v)}
        error={errors.key}
      />
      <TextField
        label="Descrição / CTA"
        value={d.socialDescription}
        onChange={(v) => set('socialDescription', v)}
      />
      <TextField
        label="URL"
        value={d.socialLink}
        onChange={(v) => set('socialLink', v)}
      />
      <SelectField
        label="Tipo de ícone"
        value={d.iconMode}
        onChange={(v) => set('iconMode', v as SocialEntry['iconMode'])}
        options={[
          { label: 'Font Awesome', value: 'fontawesome' },
          { label: 'Imagem', value: 'image' },
        ]}
      />
      {d.iconMode === 'fontawesome' ? (
        <FaIconSelect
          label="Ícone"
          value={d.fontawesomeIcon}
          onChange={(v) => set('fontawesomeIcon', v)}
        />
      ) : (
        <TextField
          label="Imagem (path)"
          value={d.image}
          onChange={(v) => set('image', v)}
        />
      )}
      <TextField
        label="Alt / abrev."
        value={d.altImage}
        onChange={(v) => set('altImage', v)}
      />
      <div className="flex justify-end">
        <Button onClick={submit} disabled={props.pending}>
          {props.pending ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `social-list.tsx`** (list with icon preview, drag)

`apps/web/components/admin/content/social-list.tsx`:

```tsx
'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { VISIT_CARD_FA_ICON_MAP } from '@/lib/visit-card-fontawesome'
import type { SocialEntry } from '@/lib/admin/content-schemas'
import { SortableList } from './sortable-list'

export function SocialList(props: {
  entries: { slug: string; data: SocialEntry }[]
  onReorder: (slugs: string[]) => void
  onEdit: (slug: string) => void
  onDelete: (slug: string) => void
}) {
  return (
    <SortableList
      items={props.entries}
      onReorder={props.onReorder}
      renderItem={(e) => {
        const icon = VISIT_CARD_FA_ICON_MAP[e.data.fontawesomeIcon]
        return (
          <div className="border-border bg-card flex items-center justify-between gap-4 rounded-[var(--radius)] border px-5 py-3">
            <span className="flex items-center gap-3">
              <span className="bg-accent-soft text-primary grid size-8 place-items-center rounded-lg">
                {e.data.iconMode === 'fontawesome' && icon ? (
                  <FontAwesomeIcon icon={icon} className="size-4" />
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {e.data.socialDescription || e.slug}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {e.data.socialLink}
                </span>
              </span>
            </span>
            <span className="flex shrink-0 gap-2">
              <button
                className="text-primary text-sm"
                onClick={() => props.onEdit(e.slug)}
              >
                Editar
              </button>
              <button
                className="text-warn text-sm"
                onClick={() => props.onDelete(e.slug)}
              >
                Remover
              </button>
            </span>
          </div>
        )
      }}
    />
  )
}
```

- [ ] **Step 3: `socials/page.tsx`** — same wiring as Task 15/16 for `'socials'` + `SocialForm`/`SocialList`, label "Redes sociais", button "+ Nova rede", delete label `socialDescription || slug`. (Write the full page mirroring the projetos page; do not abbreviate.)

- [ ] **Step 4: Stories** — `social-form.stories.tsx` (New + Editing with a full `SocialEntry`) and `social-list.stories.tsx` (Default with a `github` entry). Write them in full.

- [ ] **Step 5: E2E** (`socials.e2e.ts`) — mirror Task 15 against `**/api/admin/content/socials`, list shows a social description, create modal opens, POST body assert.

- [ ] **Step 6: Run E2E, type-check, lint, commit**

```bash
git add apps/web/components/admin/content/social-form.tsx apps/web/components/admin/content/social-form.stories.tsx apps/web/components/admin/content/social-list.tsx apps/web/components/admin/content/social-list.stories.tsx "apps/web/app/(admin)/admin/socials"
git commit -m "feat(admin): Socials surface (list, form w/ FA picker, page, E2E)"
```

---

## Task 18: Perfil surface (singleton)

**Files:** Create `apps/web/components/admin/content/profile-form.tsx` (+ `.stories.tsx`), `apps/web/app/(admin)/admin/perfil/page.tsx`, `apps/web/app/(admin)/admin/perfil/perfil.e2e.ts`.

- [ ] **Step 1: `profile-form.tsx`** (full-page form)

`apps/web/components/admin/content/profile-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  profileSchema,
  COMPANY_LINK_COLORS,
  type ProfileEntry,
} from '@/lib/admin/content-schemas'
import { TextField, TextareaField, SelectField, ToggleField } from './fields'
import { TagArrayInput } from './tag-array-input'

export function ProfileForm(props: {
  initial: ProfileEntry
  onSubmit: (d: ProfileEntry) => void
  pending?: boolean
}) {
  const [d, setD] = useState<ProfileEntry>(props.initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof ProfileEntry>(k: K, v: ProfileEntry[K]) =>
    setD((p) => ({ ...p, [k]: v }))

  const submit = () => {
    const parsed = profileSchema.safeParse(d)
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
        ),
      )
      return
    }
    setErrors({})
    props.onSubmit(parsed.data)
  }

  return (
    <div className="grid max-w-3xl gap-4 md:grid-cols-2">
      <TextField
        label="Nome"
        value={d.displayName}
        onChange={(v) => set('displayName', v)}
        error={errors.displayName}
      />
      <TextField
        label="Cargo em destaque"
        value={d.roleHighlight}
        onChange={(v) => set('roleHighlight', v)}
      />
      <TextField
        label="Empresa"
        value={d.companyName}
        onChange={(v) => set('companyName', v)}
      />
      <TextField
        label="Link da empresa"
        value={d.companyLink}
        onChange={(v) => set('companyLink', v)}
      />
      <SelectField
        label="Cor do nome da empresa"
        value={d.companyLinkColor}
        onChange={(v) => set('companyLinkColor', v)}
        options={COMPANY_LINK_COLORS}
      />
      <TextField
        label="Localização"
        value={d.location}
        onChange={(v) => set('location', v)}
      />
      <TextField
        label="Avatar (path)"
        value={d.avatarSrc}
        onChange={(v) => set('avatarSrc', v)}
      />
      <TextField
        label="Alt do avatar"
        value={d.avatarAlt}
        onChange={(v) => set('avatarAlt', v)}
      />
      <div className="md:col-span-2">
        <TextareaField
          label="Bio"
          value={d.bio}
          onChange={(v) => set('bio', v)}
        />
      </div>
      <TextField
        label="Texto de disponibilidade"
        value={d.availabilityLabel}
        onChange={(v) => set('availabilityLabel', v)}
      />
      <div className="md:col-span-2">
        <TagArrayInput
          label="Disciplinas"
          values={d.disciplines}
          onChange={(v) => set('disciplines', v)}
        />
      </div>
      <div className="md:col-span-2">
        <ToggleField
          label="Disponível para oportunidades"
          checked={d.availabilityOpen}
          onChange={(v) => set('availabilityOpen', v)}
        />
      </div>
      <div className="flex justify-end md:col-span-2">
        <Button onClick={submit} disabled={props.pending}>
          {props.pending ? 'Salvando…' : 'Salvar perfil'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `perfil/page.tsx`**

`apps/web/app/(admin)/admin/perfil/page.tsx`:

```tsx
'use client'

import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionHeader } from '@/components/section-header'
import { useProfile, useUpdateProfile } from '@/hooks/admin/content/use-profile'
import { ProfileForm } from '@/components/admin/content/profile-form'

export default function PerfilPage() {
  const profile = useProfile()
  const update = useUpdateProfile()

  return (
    <div className="space-y-6">
      <SectionHeader label="Perfil & bio" />
      {profile.isLoading ? (
        <Skeleton className="h-96 w-full rounded-[var(--radius)]" />
      ) : profile.isError ? (
        <p className="text-warn text-sm">{(profile.error as Error).message}</p>
      ) : profile.data ? (
        <ProfileForm
          initial={profile.data}
          pending={update.isPending}
          onSubmit={(data) =>
            update.mutate(data, {
              onSuccess: () => toast.success('Perfil salvo'),
              onError: (e) => toast.error((e as Error).message),
            })
          }
        />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 3: Story** — `profile-form.stories.tsx` with a full `ProfileEntry` (Default).

- [ ] **Step 4: E2E** (`perfil.e2e.ts`) — mock `**/api/admin/content/profile` GET → `{ data: <profile> }`; assert the form renders the name; fill a field + Salvar → assert PUT body. Include the base admin mocks (`**/auth/me`, stats, sessions, github/status linked).

- [ ] **Step 5: Run E2E, type-check, lint, commit**

```bash
git add apps/web/components/admin/content/profile-form.tsx apps/web/components/admin/content/profile-form.stories.tsx "apps/web/app/(admin)/admin/perfil"
git commit -m "feat(admin): Perfil & bio surface (form, page, E2E)"
```

---

# Phase D — Wiring + docs

## Task 19: Sidebar — add "Redes sociais"

**Files:** Modify `apps/web/components/admin/admin-sidebar.tsx`.

- [ ] **Step 1: Add the nav item + count**

In `admin-sidebar.tsx`, add `faShareNodes` to the `@fortawesome/free-solid-svg-icons` import. Add `socials?: number` to `SidebarCounts`. In the `GROUPS` array, under the **Site** group, add (after Perfil, before Mídia):

```ts
      { label: 'Redes sociais', href: '/admin/socials', icon: faShareNodes, countKey: 'socials' },
```

- [ ] **Step 2: Type-check, lint**

Run: `cd apps/web && pnpm exec tsc --noEmit` (confirm `faShareNodes` resolves; if not, use `faShare`), `pnpm lint`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/admin/admin-sidebar.tsx
git commit -m "feat(admin): sidebar nav for Redes sociais"
```

---

## Task 20: Docs + full verification

**Files:** Modify root `CLAUDE.md`.

- [ ] **Step 1: Document in `CLAUDE.md`**

In the **`### Admin unificado (/admin)`** subsection, add a bullet:

```markdown
- **Slice ② (CRUD de coleções):** `/admin/projetos` (cards), `/admin/carreira` (tabela), `/admin/socials` (lista + picker FA), `/admin/perfil` (form singleton) — criar/editar (modal)/apagar/drag-reorder. Lê **live do GitHub** (`lib/admin/content-read.ts`, Octokit+`yaml`+Zod, token linkado), escreve via engine (`commitFile`/`deleteFile`/`commitFiles` atômico). Registry `lib/admin/content-registry.ts`; schemas Zod `lib/admin/content-schemas.ts`; serializer `lib/admin/content-yaml.ts`; rotas `app/api/admin/content/*`; hooks `hooks/admin/content/*` (otimistas). Imagens são input de texto (upload no slice ④). Spec: `docs/superpowers/specs/2026-06-03-admin-unificado-colecoes-slice2-design.md`.
```

Also update the **Tech Stack** line to mention `yaml` if a deps list is appropriate, and the **Data flow** note that the public site still reads via `getKeystaticReader()` (unchanged).

- [ ] **Step 2: Full verification (capture real output)**

Run from `apps/web`:

```bash
cd apps/web && pnpm prettier:check   # fix new admin files only if flagged
cd apps/web && pnpm lint             # clean
cd apps/web && pnpm test             # all Jest green (admin libs + existing)
cd apps/web && pnpm build:ci         # production build; /admin/{projetos,carreira,socials,perfil} + /api/admin/content/* present
cd apps/web && pnpm audit            # no new vulns from `yaml`
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md apps/web/package.json apps/web/pnpm-lock.yaml
git commit -m "docs(admin): CLAUDE.md for slice ② CRUD de coleções"
```

---

## Self-review

**Spec coverage:**

- §3.1 registry → Task 2. §3.2 write path → Tasks 8–11. §3.3 read path → Task 6. ✅
- §4 engine `deleteFile`/`commitFiles` → Tasks 4, 5. ✅
- §5 Zod schemas + serializer → Tasks 1, 3. `yaml` dep → Task 1. ✅
- §6 routes (list/create/update/delete/reorder/profile) → Tasks 8, 9, 10, 11. ✅
- §7 surfaces (Perfil page; Projetos/Carreira/Socials list+modal+drag; FA picker; delete confirm; slug) → Tasks 12–18. Sidebar → Task 19. ✅
- §8 testing (Jest/Storybook/Playwright) → throughout (Jest 1,3,4,5,6; Storybook 12,13,15–18; E2E 15–18). ✅
- §9 risks / §10 acceptance → covered by Task 20 verification + per-surface E2E. ✅

**Placeholder scan:** Tasks 16 (steps 4,5), 17 (steps 3,4,5), 18 (steps 3,4) say "mirror Task 15 in full / write in full" rather than re-pasting near-identical page/story/E2E code — this is a deliberate instruction to replicate a fully-shown pattern with the surface's own schema (the form/list code IS given in full for each surface; only the page/story/E2E scaffold repeats). The implementer has complete reference code in Task 15. If strict no-repeat is required, copy Task 15's page/story/E2E and swap the collection key + form/list names + labels.

**Type consistency:** `CollectionDef`/`COLLECTIONS`/`getCollection` consistent (Tasks 2, 7, 8–10). `serializeEntry(def, data)`/`parseEntry(def, raw)` consistent (Tasks 3, 8–10). Engine `deleteFile(auth, opts, deps)` / `commitFiles(auth, opts, deps)` returning `CommitResult` consistent (Tasks 4, 5, 9, 10). `ListedEntry`/`useContentList`/`useContentMutations` consistent (Tasks 14, 15–17). `ProfileEntry`/`useProfile`/`useUpdateProfile` consistent (Tasks 11, 14, 18). Schema type names (`ProjectEntry`/`CarreiraEntry`/`SocialEntry`/`ProfileEntry`) consistent throughout. ✅
