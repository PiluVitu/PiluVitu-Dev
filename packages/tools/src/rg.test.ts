import { gerarRG, validarRG, dvRGSP } from './rg'
import { sementes } from './rng-teste'

describe('RG (modelo SSP-SP)', () => {
  test.each([
    ['56.843.539-4'],
    ['24.678.131-2'],
    ['38.452.917-3'],
    ['10.000.006-X'],
    ['10.000.001-0'],
  ])('aceita %s', (rg) => expect(validarRG(rg)).toBe(true))

  test('rejeita o RG do protótipo do design (DV calculado como o resto, não 11 - resto)', () => {
    expect(validarRG('38.452.917-8')).toBe(false)
    expect(dvRGSP([3, 8, 4, 5, 2, 9, 1, 7])).toBe('3')
  })

  test('rejeita base de dígitos repetidos mesmo com o DV batendo', () => {
    expect(dvRGSP([1, 1, 1, 1, 1, 1, 1, 1])).toBe('0')
    expect(validarRG('11.111.111-0')).toBe(false)
  })

  test('por padrão nunca gera DV X; com permitirX gera', () => {
    const gerados = sementes(1000).map((r) => gerarRG(r))
    expect(gerados.every((rg) => validarRG(rg) && !rg.endsWith('X'))).toBe(true)
    const comX = sementes(1000).map((r) => gerarRG(r, { permitirX: true }))
    expect(comX.some((rg) => rg.endsWith('X'))).toBe(true)
    expect(comX.every(validarRG)).toBe(true)
  })

  test('formato NN.NNN.NNN-D', () => {
    for (const r of sementes(200))
      expect(gerarRG(r)).toMatch(/^\d{2}\.\d{3}\.\d{3}-\d$/)
  })
})
