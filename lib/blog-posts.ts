import 'server-only'

import { Octokit } from '@octokit/rest'
import matter from 'gray-matter'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { draftMode } from 'next/headers'
import { unstable_noStore as noStore } from 'next/cache'

export type BlogPost = {
  slug: string
  title: string
  excerpt: string
  coverImage: string | null
  tags: string[]
  publishedAt: string
  readingTimeMinutes: number
  bodyMdx: string
  draft: boolean
}

const BLOG_OWNER = process.env.BLOG_REPO_OWNER ?? 'PiluVitu'
const BLOG_REPO = process.env.BLOG_REPO_NAME ?? 'piluvitu-blog'
const BLOG_BRANCH = 'main'

function getOctokit(): Octokit {
  return new Octokit({
    auth: process.env.BLOG_REPO_TOKEN,
  })
}

/** Estimate reading time from raw text (avg 200 wpm). */
function estimateReadingTime(text: string): number {
  const words = text.trim().split(/\s+/).length
  return Math.max(1, Math.ceil(words / 200))
}

async function skipCacheWhenDraft(): Promise<void> {
  const { isEnabled } = await draftMode()
  if (isEnabled) noStore()
}

async function _fetchAllPosts(): Promise<BlogPost[]> {
  const octokit = getOctokit()

  let files: { name: string; type: string }[]
  try {
    const { data } = await octokit.repos.getContent({
      owner: BLOG_OWNER,
      repo: BLOG_REPO,
      path: 'content/posts',
      ref: BLOG_BRANCH,
    })
    files = Array.isArray(data) ? data : []
  } catch {
    // Repo is empty or token not configured yet — return empty gracefully.
    return []
  }

  const mdxFiles = files.filter(
    (f) =>
      f.type === 'file' && (f.name.endsWith('.mdx') || f.name.endsWith('.md')),
  )

  const posts = await Promise.all(
    mdxFiles.map(async (file) => {
      const { data: raw } = await octokit.repos.getContent({
        owner: BLOG_OWNER,
        repo: BLOG_REPO,
        path: `content/posts/${file.name}`,
        ref: BLOG_BRANCH,
      })
      if (Array.isArray(raw) || raw.type !== 'file') return null

      const content = Buffer.from(
        (raw as { content: string; encoding: string }).content,
        (raw as { content: string; encoding: string })
          .encoding as BufferEncoding,
      ).toString('utf-8')

      const { data: fm, content: body } = matter(content)

      const slug: string =
        (fm.slug as string | undefined) ?? file.name.replace(/\.(mdx?|md)$/, '')

      return {
        slug,
        title: (fm.title as string | undefined) ?? slug,
        excerpt: (fm.excerpt as string | undefined) ?? '',
        coverImage: (fm.coverImage as string | null | undefined) ?? null,
        tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
        publishedAt:
          fm.publishedAt != null
            ? new Date(fm.publishedAt as string | Date).toISOString()
            : new Date().toISOString(),
        readingTimeMinutes:
          (fm.readingTimeMinutes as number | undefined) ??
          estimateReadingTime(body),
        bodyMdx: body,
        draft: (fm.draft as boolean | undefined) ?? false,
      } satisfies BlogPost
    }),
  )

  return posts
    .filter((p): p is BlogPost => p !== null)
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    )
}

/** All posts (including drafts). Cached via unstable_cache for ISR. */
const _cachedFetchAll = unstable_cache(_fetchAllPosts, ['blog-posts'], {
  tags: ['blog-posts'],
  revalidate: 1800, // 30 min ISR
})

/**
 * Returns all published post slugs — safe to call in generateStaticParams
 * (no draftMode/headers access, just the ISR-cached fetch).
 */
export async function getBlogPostSlugs(): Promise<string[]> {
  const posts = await _cachedFetchAll()
  return posts.filter((p) => !p.draft).map((p) => p.slug)
}

/** Returns published posts (drafts filtered unless draft mode is active). */
export const getBlogPosts = cache(async (): Promise<BlogPost[]> => {
  await skipCacheWhenDraft()
  const all = await _cachedFetchAll()
  const { isEnabled: isDraft } = await draftMode()
  return isDraft ? all : all.filter((p) => !p.draft)
})

/** Returns a single post by slug. Null if not found. */
export const getBlogPost = cache(
  async (slug: string): Promise<BlogPost | null> => {
    await skipCacheWhenDraft()
    const all = await _cachedFetchAll()
    const { isEnabled: isDraft } = await draftMode()
    const post = all.find((p) => p.slug === slug) ?? null
    if (!post) return null
    if (post.draft && !isDraft) return null
    return post
  },
)
