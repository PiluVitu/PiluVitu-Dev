import { afterEach, describe, expect, it } from 'vitest'
import { mapaSalvo, salvarMapa } from './import-settings'

afterEach(() => {
  localStorage.clear()
})

describe('import-settings — mapa de colunas por conta, persistido em localStorage', () => {
  it('sem nada salvo, devolve null', () => {
    expect(mapaSalvo('conta-1')).toBeNull()
  })

  it('salva e relê o mesmo mapa para a mesma conta', () => {
    const mapa = { data: 0, valor: 2, descricao: 1, temCabecalho: true }
    salvarMapa('conta-1', mapa)
    expect(mapaSalvo('conta-1')).toEqual(mapa)
  })

  it('mapas de contas diferentes não colidem', () => {
    salvarMapa('conta-1', {
      data: 0,
      valor: 1,
      descricao: 2,
      temCabecalho: true,
    })
    salvarMapa('conta-2', {
      data: 1,
      valor: 0,
      descricao: 2,
      temCabecalho: false,
    })
    expect(mapaSalvo('conta-1')).toEqual({
      data: 0,
      valor: 1,
      descricao: 2,
      temCabecalho: true,
    })
    expect(mapaSalvo('conta-2')).toEqual({
      data: 1,
      valor: 0,
      descricao: 2,
      temCabecalho: false,
    })
  })

  it('JSON corrompido no localStorage devolve null em vez de lançar', () => {
    localStorage.setItem('financas-import-mapa:conta-1', '{not json')
    expect(mapaSalvo('conta-1')).toBeNull()
  })

  it('shape inesperado (campo faltando) devolve null em vez de um mapa parcial', () => {
    localStorage.setItem(
      'financas-import-mapa:conta-1',
      JSON.stringify({ data: 0, valor: 1 }),
    )
    expect(mapaSalvo('conta-1')).toBeNull()
  })
})
