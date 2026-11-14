import { resolveSitemap } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data'
import { resolveAbsoluteUrlWithPathname } from 'next/dist/lib/metadata/resolvers/resolve-url'
import type { BlogPost } from '@/lib/blog-posts'
import { llmsTxt } from '@/lib/llms'
import { PERFIL_PADRAO } from '@/lib/perfil-padrao'
import { renderEstatico } from '@/lib/render-estatico'
import { entradasDoSitemap, rotasPublicas } from '@/lib/rotas-publicas'

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

  it('canonical no caminho do próprio post', async () => {
    mockPost.atual = base
    const meta = await generateMetadata({ params })
    expect(meta.alternates?.canonical).toBe('/posts/husky')
  })

  it('o título não muda', async () => {
    mockPost.atual = base
    const meta = await generateMetadata({ params })
    expect(meta.title).toBe('Como usar o Husky')
  })

  it('sem nenhum dos dois, não define description', async () => {
    mockPost.atual = { ...base, excerpt: '' }
    const meta = await generateMetadata({ params })
    expect(meta.description).toBeUndefined()
  })

  // O slug vem do repo do blog, que pode ser editado por fora do admin (que barra o `&`).
  // Para a busca, URLs diferentes são páginas diferentes: as três têm de bater.
  it('slug com &: o canonical resolvido pelo Next é a URL do sitemap e do llms.txt', async () => {
    const ORIGEM = 'https://piluvitu.com.br'
    const post: BlogPost = { ...base, slug: 'git&ci' }
    mockPost.atual = post
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: post.slug }),
    })
    const canonical = resolveAbsoluteUrlWithPathname(
      meta.alternates?.canonical as string,
      new URL(ORIGEM),
      `/posts/${post.slug}`,
      { trailingSlash: false, isStaticMetadataRouteFile: false },
    )
    expect(canonical).toBe('https://piluvitu.com.br/posts/git&ci')

    const xml = resolveSitemap(
      entradasDoSitemap(rotasPublicas({ posts: [post], piluLabs: [] }), ORIGEM),
    )
    const locs = [
      ...new DOMParser()
        .parseFromString(xml, 'application/xml')
        .getElementsByTagName('loc'),
    ].map((loc) => loc.textContent)
    expect(locs).toContain(canonical)

    const llms = llmsTxt(
      {
        perfil: PERFIL_PADRAO,
        socials: [],
        carreiras: [],
        piluLabs: [],
        posts: [post],
      },
      ORIGEM,
    )
    expect(llms).toContain(`- [${post.title}](${canonical}): `)
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

describe('posts/[slug] — corpo do post', () => {
  // `prose-invert` sem o `dark:` pinta o tema claro com as cores do escuro:
  // texto #d1d5dc e títulos #fff sobre #f7f9fc (1,39:1 e 1,05:1, WEB-01 da auditoria).
  it('só inverte as cores da prosa no tema escuro', async () => {
    mockPost.atual = base
    const raiz = renderEstatico(await PostPage({ params }))
    const classes = [...(raiz.querySelector('.prose')?.classList ?? [])]
    expect(classes).toContain('dark:prose-invert')
    expect(classes).not.toContain('prose-invert')
  })
})
