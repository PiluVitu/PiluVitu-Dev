/** @jest-environment node */
import { nextHeadersFalso } from '@/lib/next-headers-falso'
import { sealToken } from '@/lib/admin/token-cookie'
import type { BlogPost } from '@/lib/blog-posts'
import type { AdminStats } from './route'

jest.mock('server-only', () => ({}))
jest.mock(
  'next/headers',
  () => jest.requireActual('@/lib/next-headers-falso').modulo,
)

function post(slug: string, draft: boolean): BlogPost {
  return {
    slug,
    title: `Título de ${slug}`,
    excerpt: '',
    coverImage: null,
    tags: [],
    publishedAt: '2026-01-01T00:00:00.000Z',
    readingTimeMinutes: 1,
    bodyMdx: '',
    draft,
    tldr: '',
    metaDescription: '',
  }
}

jest.mock('@/lib/blog-posts', () => ({
  getAllBlogPosts: async () => [
    post('publicado', false),
    post('segredo', true),
  ],
}))
jest.mock('@/lib/site-content', () => ({
  getPiluLabs: async () => [],
  getCarreiras: async () => [],
}))

import { GET } from './route'

function githubPermite(push: boolean) {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ permissions: { push, pull: true } }), {
      status: 200,
    }),
  )
}

async function stats(): Promise<AdminStats> {
  const res = await GET()
  return (await res.json()) as AdminStats
}

beforeEach(() => {
  process.env.ADMIN_TOKEN_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres'
  nextHeadersFalso.reiniciar()
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('GET /api/admin/stats', () => {
  it('anônimo vê as contagens, mas nenhum título ou slug de rascunho', async () => {
    const corpo = await stats()

    expect(corpo.posts).toBe(2)
    expect(corpo.drafts).toBe(1)
    expect(corpo.published).toBe(1)
    expect(corpo.recentPosts.map((p) => p.slug)).toEqual(['publicado'])
    expect(JSON.stringify(corpo)).not.toContain('segredo')
  })

  it('GitHub linkado de quem não escreve no repo do blog também não vê rascunho', async () => {
    nextHeadersFalso.reiniciar({
      piluvitu_admin_gh: sealToken({
        token: 'token-de-teste',
        login: 'alguem',
      }),
    })
    githubPermite(false)

    const corpo = await stats()

    expect(corpo.drafts).toBe(1)
    expect(corpo.recentPosts.map((p) => p.slug)).toEqual(['publicado'])
    expect(JSON.stringify(corpo)).not.toContain('segredo')
  })

  it('com o GitHub fora do ar, falha fechada: sem rascunho', async () => {
    nextHeadersFalso.reiniciar({
      piluvitu_admin_gh: sealToken({
        token: 'token-de-teste',
        login: 'alguem',
      }),
    })
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('fetch failed'))

    const corpo = await stats()

    expect(corpo.recentPosts.map((p) => p.slug)).toEqual(['publicado'])
  })

  it('quem escreve no repo do blog vê os rascunhos', async () => {
    nextHeadersFalso.reiniciar({
      piluvitu_admin_gh: sealToken({ token: 'token-de-teste', login: 'dona' }),
    })
    githubPermite(true)

    const corpo = await stats()

    expect(corpo.recentPosts.map((p) => p.slug)).toEqual([
      'publicado',
      'segredo',
    ])
  })
})
