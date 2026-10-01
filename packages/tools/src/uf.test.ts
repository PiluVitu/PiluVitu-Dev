import { UFS, UF_NOME, CODIGO_UF_TITULO, REGIAO_FISCAL_CPF } from './uf'

describe('uf', () => {
  test('27 UFs, sem repetição', () => {
    expect(new Set(UFS).size).toBe(27)
  })

  test.each(UFS)('%s tem nome, código TSE e região fiscal', (uf) => {
    expect(UF_NOME[uf]).toMatch(/^[A-Z][a-zà-ú]+( (de|do|da|[A-Z][a-zà-ú]+))*$/)
    expect(CODIGO_UF_TITULO[uf]).toMatch(/^(0[1-9]|1\d|2[0-7])$/)
    expect(REGIAO_FISCAL_CPF[uf]).toBeGreaterThanOrEqual(0)
    expect(REGIAO_FISCAL_CPF[uf]).toBeLessThanOrEqual(9)
  })

  test('códigos TSE únicos, com o exterior (ZZ) em 28', () => {
    expect(new Set(Object.values(CODIGO_UF_TITULO)).size).toBe(28)
    expect(CODIGO_UF_TITULO.ZZ).toBe('28')
  })

  test('UF_NOME traz o nome com acento', () => {
    expect(UF_NOME.SP).toBe('São Paulo')
    expect(UF_NOME.PI).toBe('Piauí')
    expect(UF_NOME.DF).toBe('Distrito Federal')
  })
})
