import type { DataArticle } from '@/hooks/useArticleData'
import type { BlogPost } from '@/lib/blog-posts'

export type ArticleCardView = {
  id: string
  source: 'devto' | 'blog'
  title: string
  href: string
  isExternal: boolean
  socialImage: string | null
  readingTimeMinutes: number
  reactionsCount: number
  commentsCount: number
  publishedAt: string
}

export function devToToView(a: DataArticle): ArticleCardView {
  return {
    id: String(a.id),
    source: 'devto',
    title: a.title,
    href: a.url,
    isExternal: true,
    socialImage: a.social_image ?? null,
    readingTimeMinutes: a.reading_time_minutes,
    reactionsCount: a.positive_reactions_count ?? 0,
    commentsCount: a.comments_count ?? 0,
    publishedAt:
      a.published_at ?? a.published_timestamp ?? new Date().toISOString(),
  }
}

export function blogPostToView(p: BlogPost): ArticleCardView {
  return {
    id: `blog-${p.slug}`,
    source: 'blog',
    title: p.title,
    href: `/posts/${p.slug}`,
    isExternal: false,
    socialImage: p.coverImage,
    readingTimeMinutes: p.readingTimeMinutes,
    reactionsCount: 0,
    commentsCount: 0,
    publishedAt: p.publishedAt,
  }
}

/** Merge devto + blog posts sorted by publishedAt desc, returning top N. */
export function mergeFeed(
  devto: ArticleCardView[],
  blog: ArticleCardView[],
  limit = 6,
): ArticleCardView[] {
  return [...devto, ...blog]
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    )
    .slice(0, limit)
}
