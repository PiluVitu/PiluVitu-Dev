/** @jest-environment node */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const mockArquivos: Record<string, string> = {}

jest.mock('server-only', () => ({}))
jest.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
  unstable_noStore: () => {},
}))
jest.mock(
  'next/headers',
  () => jest.requireActual('@/lib/next-headers-falso').modulo,
)
jest.mock('@octokit/rest', () => ({
  Octokit: class {
    repos = {
      getContent: async ({ path }: { path: string }) => {
        if (path === 'content/posts') {
          return {
            data: Object.keys(mockArquivos).map((name) => ({
              name,
              type: 'file',
            })),
          }
        }
        const nome = path.replace('content/posts/', '')
        return {
          data: {
            type: 'file',
            encoding: 'base64',
            content: Buffer.from(mockArquivos[nome] ?? '').toString('base64'),
          },
        }
      },
    }
  },
}))

import { nextHeadersFalso, selarPreviewDeTeste } from '@/lib/next-headers-falso'
import { getAllBlogPosts, getBlogPost, getBlogPosts } from './blog-posts'

describe('lib/blog-posts', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockArquivos)) delete mockArquivos[k]
    nextHeadersFalso.reiniciar()
  })

  it('lê tldr e metaDescription do frontmatter', async () => {
    mockArquivos['com-resumo.mdx'] = [
      '---',
      'title: Com resumo',
      'slug: com-resumo',
      "publishedAt: '2025-01-01'",
      "tldr: 'Eu mostro X: e Y.'",
      'metaDescription: Uma descrição para a busca.',
      '---',
      '',
      'corpo',
    ].join('\n')
    const [post] = await getAllBlogPosts()
    expect(post?.tldr).toBe('Eu mostro X: e Y.')
    expect(post?.metaDescription).toBe('Uma descrição para a busca.')
  })

  it('post antigo, sem os campos, sai com strings vazias', async () => {
    mockArquivos['antigo.mdx'] = [
      '---',
      'title: Antigo',
      'slug: antigo',
      "publishedAt: '2025-01-01'",
      '---',
      '',
      'corpo',
    ].join('\n')
    const [post] = await getAllBlogPosts()
    expect(post?.tldr).toBe('')
    expect(post?.metaDescription).toBe('')
  })

  it('ignora tldr e metaDescription que não são texto', async () => {
    mockArquivos['torto.mdx'] = [
      '---',
      'title: Torto',
      'slug: torto',
      "publishedAt: '2025-01-01'",
      'tldr: 42',
      'metaDescription: [a, b]',
      '---',
      '',
      'corpo',
    ].join('\n')
    const [post] = await getAllBlogPosts()
    expect(post?.tldr).toBe('')
    expect(post?.metaDescription).toBe('')
  })
})

// Achado de 2026-11-12: o /preview/start ligava o draft mode para qualquer visitante, e o draft
// mode sozinho bastava para a home e /posts/<slug> mostrarem os rascunhos do repo privado.
describe('rascunhos só com o preview selado e válido', () => {
  function post(slug: string, draft: boolean) {
    return [
      '---',
      `title: ${slug}`,
      `slug: ${slug}`,
      "publishedAt: '2025-01-01'",
      `draft: ${draft}`,
      '---',
      '',
      'corpo',
    ].join('\n')
  }

  beforeEach(() => {
    process.env.ADMIN_TOKEN_SECRET =
      'segredo-de-teste-com-mais-de-32-caracteres'
    for (const k of Object.keys(mockArquivos)) delete mockArquivos[k]
    mockArquivos['publicado.mdx'] = post('publicado', false)
    mockArquivos['rascunho.mdx'] = post('rascunho', true)
  })

  it('sem draft mode, só os publicados', async () => {
    nextHeadersFalso.reiniciar()
    expect((await getBlogPosts()).map((p) => p.slug)).toEqual(['publicado'])
    expect(await getBlogPost('rascunho')).toBeNull()
  })

  it('draft mode ligado sem o cookie selado não mostra rascunho', async () => {
    nextHeadersFalso.reiniciar({ 'ks-branch': 'main' }, true)
    expect((await getBlogPosts()).map((p) => p.slug)).toEqual(['publicado'])
    expect(await getBlogPost('rascunho')).toBeNull()
  })

  it('draft mode ligado com selado forjado não mostra rascunho', async () => {
    nextHeadersFalso.reiniciar({ piluvitu_preview: 'forjado' }, true)
    expect((await getBlogPosts()).map((p) => p.slug)).toEqual(['publicado'])
    expect(await getBlogPost('rascunho')).toBeNull()
  })

  it('com o preview selado e válido, os rascunhos aparecem', async () => {
    nextHeadersFalso.reiniciar(
      { piluvitu_preview: selarPreviewDeTeste('main') },
      true,
    )
    expect((await getBlogPosts()).map((p) => p.slug).sort()).toEqual([
      'publicado',
      'rascunho',
    ])
    expect((await getBlogPost('rascunho'))?.slug).toBe('rascunho')
  })

  it('o selado sozinho, sem o draft mode, não mostra rascunho', async () => {
    nextHeadersFalso.reiniciar({
      piluvitu_preview: selarPreviewDeTeste('main'),
    })
    expect((await getBlogPosts()).map((p) => p.slug)).toEqual(['publicado'])
  })
})

// O resumo é gerado só no editor do admin. A página pública (ISR) apenas lê o
// que já está no frontmatter: nunca chama a IA nem conhece o ramielle.
describe('fronteira: o resumo nunca roda no ISR', () => {
  const raiz = join(__dirname, '..')
  const publicos = ['lib/blog-posts.ts', 'app/(site)/posts/[slug]/page.tsx']

  it.each(publicos)('%s não importa lib/admin/atelier', (arquivo) => {
    const fonte = readFileSync(join(raiz, arquivo), 'utf8')
    expect(fonte).not.toMatch(/lib\/admin\/atelier/)
    expect(fonte).not.toMatch(/atelierApi|resumo-button/)
  })

  it.each(publicos)('%s não cita o ramielle', (arquivo) => {
    const fonte = readFileSync(join(raiz, arquivo), 'utf8')
    expect(fonte).not.toMatch(/ramielle/i)
  })

  it('o componente do TL;DR público também fica fora do atelier', () => {
    const fonte = readFileSync(
      join(raiz, 'components/posts/post-tldr.tsx'),
      'utf8',
    )
    expect(fonte).not.toMatch(/lib\/admin|ramielle|atelier/i)
  })
})
