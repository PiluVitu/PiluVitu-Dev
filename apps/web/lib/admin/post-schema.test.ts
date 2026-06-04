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
    expect(extractKnownFrontmatter(raw)).toEqual(fm)
  })
  it('fills defaults for missing optional fields', () => {
    const parsed = postFrontmatterSchema.parse({ title: 'T', slug: 't' })
    expect(parsed.tags).toEqual([])
    expect(parsed.draft).toBe(false)
    expect(parsed.excerpt).toBe('')
    expect(parsed.coverImage).toBe('')
  })
})
