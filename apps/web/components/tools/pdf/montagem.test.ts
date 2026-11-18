import { idDaPagina, origemDoId } from './montagem'

describe('o id da página (editor único)', () => {
  it('a página de arquivo é "a<arquivo>p<índice>", e o id não muda quando ela muda de lugar', () => {
    expect(idDaPagina(0, 0)).toBe('a0p0')
    expect(idDaPagina(1, 12)).toBe('a1p12')
  })
})

describe('a origem pelo id da página', () => {
  it('volta ao arquivo e ao índice do idDaPagina', () => {
    expect(origemDoId(idDaPagina(0, 0))).toEqual({ arquivo: 0, indice: 0 })
    expect(origemDoId(idDaPagina(3, 125))).toEqual({ arquivo: 3, indice: 125 })
  })

  it('a página em branco e o id que não é de página não têm arquivo', () => {
    for (const id of ['b0', 'b12', 'a0', 'a0p', 'ap0', 'a0p1x', 'xa0p1', '']) {
      expect(origemDoId(id)).toBeNull()
    }
  })
})
