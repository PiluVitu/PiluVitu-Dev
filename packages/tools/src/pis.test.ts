import { gerarPIS, validarPIS, dvPIS } from './pis'
import { sementes } from './rng-teste'

describe('PIS/PASEP/NIS', () => {
  test.each([['120.12345.67-2'], ['170.00000.01-3'], ['123.45678.90-0']])(
    'aceita %s',
    (pis) => expect(validarPIS(pis)).toBe(true),
  )

  test('rejeita DV errado e dígitos repetidos', () => {
    expect(validarPIS('120.12345.67-5')).toBe(false)
    expect(validarPIS('111.11111.11-1')).toBe(false)
  })

  test('resto 0 ou 1 dá DV 0', () => {
    expect(dvPIS([1, 2, 3, 4, 5, 6, 7, 8, 9, 0])).toBe(0)
  })

  test('formato 000.00000.00-0 e 1000 sementes válidas', () => {
    for (const r of sementes(1000)) {
      const pis = gerarPIS(r)
      expect(pis).toMatch(/^\d{3}\.\d{5}\.\d{2}-\d$/)
      expect(validarPIS(pis)).toBe(true)
    }
  })
})
