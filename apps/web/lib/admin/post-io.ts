import type { Octokit } from '@octokit/rest'
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
async function makeOctokitDefault(
  token: string,
): Promise<InstanceType<typeof Octokit>> {
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
    (makeOctokitDefault as unknown as NonNullable<ReadDeps['makeOctokit']>)
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
    (makeOctokitDefault as unknown as NonNullable<ReadDeps['makeOctokit']>)
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
