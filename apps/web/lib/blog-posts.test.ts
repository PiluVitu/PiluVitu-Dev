/** @jest-environment node */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const mockArquivos: Record<string, string> = {}

jest.mock('server-only', () => ({}))
jest.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
  unstable_noStore: () => {},
}))
jest.mock('next/headers', () => ({
  draftMode: async () => ({ isEnabled: false }),
}))
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

import { getAllBlogPosts } from './blog-posts'

describe('lib/blog-posts', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockArquivos)) delete mockArquivos[k]
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
