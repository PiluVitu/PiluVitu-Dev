import { idDaPagina } from './montagem'

describe('o id da página (editor único)', () => {
  it('a página de arquivo é "a<arquivo>p<índice>", e o id não muda quando ela muda de lugar', () => {
    expect(idDaPagina(0, 0)).toBe('a0p0')
    expect(idDaPagina(1, 12)).toBe('a1p12')
  })
})
