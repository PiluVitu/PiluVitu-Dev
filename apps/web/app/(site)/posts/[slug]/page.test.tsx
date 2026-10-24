import type { BlogPost } from '@/lib/blog-posts'
import { renderEstatico } from '@/lib/render-estatico'

const mockPost: { atual: BlogPost | null } = { atual: null }

jest.mock('@/lib/blog-posts', () => ({
  getBlogPost: async () => mockPost.atual,
  getBlogPostSlugs: async () => [],
}))
jest.mock('next-mdx-remote/rsc', () => ({
  MDXRemote: ({ source }: { source: string }) => <div>{source}</div>,
}))
jest.mock('@/lib/mdx/mdx-components', () => ({ mdxComponents: {} }))
jest.mock('@/lib/mdx/mdx-plugins', () => ({
  MDX_REMARK_PLUGINS: [],
  MDX_REHYPE_PLUGINS: [],
}))
jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound')
  },
}))

import PostPage, { generateMetadata } from './page'

const base: BlogPost = {
  slug: 'husky',
  title: 'Como usar o Husky',
  excerpt: 'O excerpt do post.',
  coverImage: null,
  tags: ['git'],
  publishedAt: '2025-01-01T00:00:00.000Z',
  readingTimeMinutes: 3,
  bodyMdx: 'corpo do post',
  draft: false,
  tldr: '',
  metaDescription: '',
}

const params = Promise.resolve({ slug: 'husky' })

describe('posts/[slug] — generateMetadata', () => {
  it('usa a metaDescription quando existe', async () => {
    mockPost.atual = { ...base, metaDescription: 'A descrição para a busca.' }
    const meta = await generateMetadata({ params })
    expect(meta.description).toBe('A descrição para a busca.')
    expect(meta.openGraph?.description).toBe('A descrição para a busca.')
    expect(meta.twitter?.description).toBe('A descrição para a busca.')
  })

  it('cai no excerpt quando não há metaDescription', async () => {
    mockPost.atual = base
    const meta = await generateMetadata({ params })
    expect(meta.description).toBe('O excerpt do post.')
    expect(meta.openGraph?.description).toBe('O excerpt do post.')
  })

  it('metaDescription só de espaço cai no excerpt', async () => {
    mockPost.atual = { ...base, metaDescription: ' \n ' }
    const meta = await generateMetadata({ params })
    expect(meta.description).toBe('O excerpt do post.')
    expect(meta.openGraph?.description).toBe('O excerpt do post.')
    expect(meta.twitter?.description).toBe('O excerpt do post.')
  })

  it('sem nenhum dos dois, não define description', async () => {
    mockPost.atual = { ...base, excerpt: '' }
    const meta = await generateMetadata({ params })
    expect(meta.description).toBeUndefined()
  })
})

describe('posts/[slug] — TL;DR', () => {
  it('mostra o TL;DR antes do corpo, sem rótulo de IA', async () => {
    mockPost.atual = { ...base, tldr: 'Eu mostro o Husky em dois passos.' }
    const raiz = renderEstatico(await PostPage({ params }))
    const tldr = raiz.querySelector('[aria-label="TL;DR"]')
    expect(tldr?.textContent).toContain('Eu mostro o Husky em dois passos.')
    const html = raiz.innerHTML
    expect(html.indexOf('Eu mostro o Husky')).toBeLessThan(
      html.indexOf('corpo do post'),
    )
    expect(raiz.textContent).not.toMatch(/\bIA\b|intelig[êe]ncia|Claude|gerad/i)
  })

  it('sem tldr, não renderiza o bloco', async () => {
    mockPost.atual = base
    const raiz = renderEstatico(await PostPage({ params }))
    expect(raiz.querySelector('[aria-label="TL;DR"]')).toBeNull()
  })
})
