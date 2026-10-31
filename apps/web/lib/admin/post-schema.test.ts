/** @jest-environment node */
import { postFrontmatterSchema, extractKnownFrontmatter } from './post-schema'

const fm = {
  title: 'Como usar o Husky',
  slug: 'como-usar-o-husky',
  excerpt: 'resumo',
  coverImage: '/capa.png',
  tags: ['git', 'husky'],
  publishedAt: '2025-04-28T00:00:00.000Z',
  draft: false,
  readingTimeMinutes: 0,
  tldr: '',
  metaDescription: '',
}

describe('post-schema', () => {
  it('accepts valid frontmatter', () => {
    expect(postFrontmatterSchema.parse(fm)).toEqual(fm)
  })
  it('rejects a missing title', () => {
    expect(postFrontmatterSchema.safeParse({ ...fm, title: '' }).success).toBe(
      false,
    )
  })
  it('rejects an invalid slug', () => {
    expect(
      postFrontmatterSchema.safeParse({ ...fm, slug: 'Bad Slug' }).success,
    ).toBe(false)
  })
  it('extracts only the known fields from a raw frontmatter with extras', () => {
    const raw = { ...fm, readingTimeMinutes: 5, customKey: 'x' }
    expect(extractKnownFrontmatter(raw)).toEqual({
      ...fm,
      readingTimeMinutes: 5,
    })
  })
  it('fills defaults for missing optional fields', () => {
    const parsed = postFrontmatterSchema.parse({ title: 'T', slug: 't' })
    expect(parsed.tags).toEqual([])
    expect(parsed.draft).toBe(false)
    expect(parsed.excerpt).toBe('')
    expect(parsed.coverImage).toBe('')
  })

  it('aceita o frontmatter antigo, sem tldr nem metaDescription', () => {
    const antigo = {
      title: 'Como usar o Husky',
      slug: 'como-usar-o-husky',
      excerpt: 'resumo',
      tags: ['git'],
      publishedAt: '2025-04-28T00:00:00.000Z',
      draft: false,
    }
    const parsed = postFrontmatterSchema.parse(antigo)
    expect(parsed.tldr).toBe('')
    expect(parsed.metaDescription).toBe('')
    expect(extractKnownFrontmatter(antigo).tldr).toBe('')
  })

  it('lê tldr e metaDescription do frontmatter cru', () => {
    const raw = {
      ...fm,
      tldr: 'Em resumo: X.',
      metaDescription: 'M'.repeat(160),
    }
    const out = extractKnownFrontmatter(raw)
    expect(out.tldr).toBe('Em resumo: X.')
    expect(out.metaDescription).toBe('M'.repeat(160))
  })

  it('aceita metaDescription com 160 caracteres e recusa com 161', () => {
    expect(
      postFrontmatterSchema.safeParse({
        ...fm,
        metaDescription: 'a'.repeat(160),
      }).success,
    ).toBe(true)
    const r = postFrontmatterSchema.safeParse({
      ...fm,
      metaDescription: 'a'.repeat(161),
    })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.path).toEqual(['metaDescription'])
  })
})
