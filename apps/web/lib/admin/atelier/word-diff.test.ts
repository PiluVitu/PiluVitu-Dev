import { wordDiff } from './word-diff'

describe('wordDiff', () => {
  it('marca palavras iguais como equal', () => {
    const segs = wordDiff('oi mundo', 'oi mundo')
    expect(segs.every((s) => s.type === 'equal')).toBe(true)
    expect(segs.map((s) => s.value).join('')).toBe('oi mundo')
  })

  it('marca substituição como remove + add', () => {
    const segs = wordDiff('txto', 'texto')
    const removed = segs.filter((s) => s.type === 'remove').map((s) => s.value)
    const added = segs.filter((s) => s.type === 'add').map((s) => s.value)
    expect(removed).toContain('txto')
    expect(added).toContain('texto')
  })

  it('reconstrói o original juntando equal+remove e o corrigido juntando equal+add', () => {
    const segs = wordDiff('um dios tres', 'um dois tres')
    const original = segs
      .filter((s) => s.type !== 'add')
      .map((s) => s.value)
      .join('')
    const corrected = segs
      .filter((s) => s.type !== 'remove')
      .map((s) => s.value)
      .join('')
    expect(original).toBe('um dios tres')
    expect(corrected).toBe('um dois tres')
  })
})
