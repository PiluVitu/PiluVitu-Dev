import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getAllBlogPosts } from '@/lib/blog-posts'
import { getProjects, getCarreiras } from '@/lib/site-content'
import { openToken, ADMIN_GH_COOKIE } from '@/lib/admin/token-cookie'

export const dynamic = 'force-dynamic'

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
  // Aggregate counts are public; draft titles/slugs are private — only a linked
  // admin (whose sealed GitHub cookie decrypts) sees draft entries in recentPosts.
  const jar = await cookies()
  const sealed = jar.get(ADMIN_GH_COOKIE)?.value
  const linked = sealed ? openToken(sealed) !== null : false

  const [posts, projects, careers] = await Promise.all([
    getAllBlogPosts(),
    getProjects(),
    getCarreiras(),
  ])
  const drafts = posts.filter((p) => p.draft).length
  const visiblePosts = linked ? posts : posts.filter((p) => !p.draft)
  const body: AdminStats = {
    posts: posts.length,
    drafts,
    published: posts.length - drafts,
    projects: projects.length,
    careers: careers.length,
    careersCurrent: careers.filter((c) => c.current).length,
    recentPosts: visiblePosts.slice(0, 8).map((p) => ({
      slug: p.slug,
      title: p.title,
      draft: p.draft,
      readingTimeMinutes: p.readingTimeMinutes,
      publishedAt: p.publishedAt,
    })),
  }
  return NextResponse.json(body)
}
