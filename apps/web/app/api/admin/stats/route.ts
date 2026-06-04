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
