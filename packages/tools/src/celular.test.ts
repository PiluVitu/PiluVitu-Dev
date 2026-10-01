import { gerarCelular } from './celular'
import { minimo, sementes } from './rng-teste'

describe('celular', () => {
  test('formato (DD) 9XXXX-XXXX, E.164 e DDD preservado', () => {
    for (const r of sementes(200)) {
      const c = gerarCelular(r, '84')
      expect(c.formatado).toMatch(/^\(84\) 9[6-9]\d{3}-\d{4}$/)
      expect(c.e164).toMatch(/^\+55849[6-9]\d{7}$/)
      expect(c.digitos).toBe(c.e164.slice(3))
      expect(c.formatado).toBe(`(${c.ddd}) ${c.numero}`)
    }
  })

  test('DDD inválido lança', () => {
    expect(() => gerarCelular(minimo, '10')).toThrow()
  })
})
