import { idDaPagina, montagemDoPlano } from './montagem'

describe('o id da página (editor único)', () => {
  it('a página de arquivo é "a<arquivo>p<índice>", e o id não muda quando ela muda de lugar', () => {
    expect(idDaPagina(0, 0)).toBe('a0p0')
    expect(idDaPagina(1, 12)).toBe('a1p12')
  })
})

describe('montagemDoPlano (o plano de um arquivo só, para o motor.montar)', () => {
  it('cada página vira uma página do arquivo 0 com o id dela, o giro e a moldura igual ao giro', () => {
    expect(
      montagemDoPlano([
        { indice: 2, giro: 90 },
        { indice: 0, giro: 0 },
      ]),
    ).toEqual([
      { id: 'a0p2', origem: { arquivo: 0, indice: 2 }, giro: 90, moldura: 90 },
      { id: 'a0p0', origem: { arquivo: 0, indice: 0 }, giro: 0, moldura: 0 },
    ])
  })

  it('plano vazio dá montagem vazia', () => {
    expect(montagemDoPlano([])).toEqual([])
  })
})
