import { NextResponse } from 'next/server'
import { exigirAdmin } from '@/lib/admin/exigir-admin'
import { getAllBlogPosts } from '@/lib/blog-posts'
import { getPiluLabs, getCarreiras } from '@/lib/site-content'

export const dynamic = 'force-dynamic'

export interface AdminStats {
  posts: number
  drafts: number
  published: number
  pilulabs: number
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
  // As contagens são públicas; título e slug de rascunho, só para quem escreve no repo do blog.
  const [admin, posts, pilulabs, careers] = await Promise.all([
    exigirAdmin(),
    getAllBlogPosts(),
    getPiluLabs(),
    getCarreiras(),
  ])
  const drafts = posts.filter((p) => p.draft).length
  const visiblePosts = admin ? posts : posts.filter((p) => !p.draft)
  const body: AdminStats = {
    posts: posts.length,
    drafts,
    published: posts.length - drafts,
    pilulabs: pilulabs.length,
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
