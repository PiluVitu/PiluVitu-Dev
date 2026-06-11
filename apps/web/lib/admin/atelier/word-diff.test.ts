import { wordDiff, extractCorrections } from './word-diff'

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

describe('extractCorrections', () => {
  const corr = (a: string, b: string) => extractCorrections(wordDiff(a, b))

  it('texto idêntico não tem correções', () => {
    expect(corr('oi mundo', 'oi mundo')).toEqual([])
  })

  it('uma substituição vira uma correção antes → depois', () => {
    expect(corr('txto', 'texto')).toEqual([{ before: 'txto', after: 'texto' }])
  })

  it('só a palavra alterada entra, no meio de iguais', () => {
    expect(corr('um dios tres', 'um dois tres')).toEqual([
      { before: 'dios', after: 'dois' },
    ])
  })

  it('palavras alteradas adjacentes viram correções separadas', () => {
    expect(corr('txto compreio', 'texto comprei')).toEqual([
      { before: 'txto', after: 'texto' },
      { before: 'compreio', after: 'comprei' },
    ])
  })

  it('adição pura tem before vazio', () => {
    expect(corr('ola mundo', 'ola lindo mundo')).toEqual([
      { before: '', after: 'lindo' },
    ])
  })

  it('remoção pura tem after vazio', () => {
    expect(corr('ola lindo mundo', 'ola mundo')).toEqual([
      { before: 'lindo', after: '' },
    ])
  })

  it('mudança só de espaço em branco é ignorada', () => {
    expect(corr('texto  fim', 'texto fim')).toEqual([])
  })
})
