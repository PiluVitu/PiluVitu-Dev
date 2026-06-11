import { wordDiff, diffParts, applyParts } from './word-diff'

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

describe('diffParts + applyParts', () => {
  const parts = (a: string, b: string) => diffParts(wordDiff(a, b))

  it('all-accept reconstrói o texto corrigido', () => {
    expect(applyParts(parts('um dios tres', 'um dois tres'), () => true)).toBe(
      'um dois tres',
    )
  })

  it('all-reject reconstrói o original', () => {
    expect(applyParts(parts('um dios tres', 'um dois tres'), () => false)).toBe(
      'um dios tres',
    )
  })

  it('rejeitar uma mudança específica mantém só ela no original', () => {
    // duas mudanças: idx 0 (txto→texto), idx 1 (compreio→comprei)
    const p = parts('txto compreio', 'texto comprei')
    expect(applyParts(p, (i) => i !== 1)).toBe('texto compreio')
    expect(applyParts(p, (i) => i !== 0)).toBe('txto comprei')
  })

  it('texto idêntico: só equal, reconstrução == original', () => {
    const p = parts('oi mundo', 'oi mundo')
    expect(p.every((x) => x.kind === 'equal')).toBe(true)
    expect(applyParts(p, () => true)).toBe('oi mundo')
  })

  it('preserva espaços ao reconstruir (aceito ou rejeitado)', () => {
    const p = parts('a  b', 'a b') // mudança só de espaço
    expect(applyParts(p, () => true)).toBe('a b')
    expect(applyParts(p, () => false)).toBe('a  b')
  })

  it('adição pura: aceita insere, rejeita omite', () => {
    const p = parts('ola mundo', 'ola lindo mundo')
    expect(applyParts(p, () => true)).toBe('ola lindo mundo')
    expect(applyParts(p, () => false)).toBe('ola mundo')
  })
})
