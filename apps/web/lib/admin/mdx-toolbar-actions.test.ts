import {
  wrapSelection,
  prefixLines,
  linkSelection,
} from './mdx-toolbar-actions'

describe('wrapSelection', () => {
  it('envolve a seleção', () => {
    const r = wrapSelection('foo bar baz', 4, 7, '**', '**')
    expect(r.text).toBe('foo **bar** baz')
    expect(r.text.slice(r.selFrom, r.selTo)).toBe('bar')
  })
  it('insere o par com seleção vazia, cursor no meio', () => {
    const r = wrapSelection('ab', 1, 1, '`', '`')
    expect(r.text).toBe('a``b')
    expect(r.selFrom).toBe(2)
    expect(r.selTo).toBe(2)
  })
})

describe('prefixLines', () => {
  it('prefixa a linha tocada', () => {
    const r = prefixLines('linha um\nlinha dois', 2, 2, '## ')
    expect(r.text).toBe('## linha um\nlinha dois')
  })
  it('prefixa várias linhas selecionadas', () => {
    const r = prefixLines('a\nb', 0, 3, '- ')
    expect(r.text).toBe('- a\n- b')
  })
})

describe('linkSelection', () => {
  it('vira [seleção](url) com o cursor na url', () => {
    const r = linkSelection('veja aqui', 5, 9)
    expect(r.text).toBe('veja [aqui](url)')
    expect(r.text.slice(r.selFrom, r.selTo)).toBe('url')
  })
})
