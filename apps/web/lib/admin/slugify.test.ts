/** @jest-environment node */
import { slugify } from './slugify'

describe('slugify', () => {
  it('lowercases, strips accents, hyphenates', () => {
    expect(slugify('Live PRs')).toBe('live-prs')
    expect(slugify('Configuração Inicial')).toBe('configuracao-inicial')
  })
  it('collapses separators and trims', () => {
    expect(slugify('  A — B / C  ')).toBe('a-b-c')
    expect(slugify('a__b--c')).toBe('a-b-c')
  })
  it('drops non-alphanumerics', () => {
    expect(slugify('C++ & Go!')).toBe('c-go')
  })
})
