import { sfc32 } from './prng'
import {
  type Rng,
  rngPadrao,
  escolher,
  embaralhar,
  digitosAleatorios,
  somenteDigitos,
} from './aleatorio'

describe('aleatorio', () => {
  test('o Prng do prng.ts serve como Rng', () => {
    const rng: Rng = sfc32(1, 2, 3, 4)
    const n = rng.int(10)
    expect(n).toBeGreaterThanOrEqual(0)
    expect(n).toBeLessThan(10)
  })

  test('rngPadrao.int fica em [0, n)', () => {
    for (let i = 0; i < 1000; i++) {
      const n = rngPadrao.int(7)
      expect(Number.isInteger(n)).toBe(true)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(7)
    }
  })

  test('escolher devolve o item do índice sorteado', () => {
    expect(escolher({ int: () => 2 }, ['a', 'b', 'c'])).toBe('c')
  })

  test('embaralhar devolve uma permutação sem mudar a entrada', () => {
    const entrada = [1, 2, 3, 4, 5]
    const saida = embaralhar(sfc32(7, 7, 7, 7), entrada)
    expect(entrada).toEqual([1, 2, 3, 4, 5])
    expect([...saida].sort((a, b) => a - b)).toEqual(entrada)
  })

  test('embaralhar é determinístico por semente', () => {
    expect(embaralhar(sfc32(3, 3, 3, 3), [1, 2, 3, 4, 5])).toEqual(
      embaralhar(sfc32(3, 3, 3, 3), [1, 2, 3, 4, 5]),
    )
  })

  test('digitosAleatorios devolve n dígitos de 0 a 9', () => {
    const d = digitosAleatorios(sfc32(1, 1, 1, 1), 50)
    expect(d).toHaveLength(50)
    expect(d.every((x) => Number.isInteger(x) && x >= 0 && x <= 9)).toBe(true)
  })

  test('somenteDigitos tira a máscara', () => {
    expect(somenteDigitos('529.982.247-25')).toBe('52998224725')
    expect(somenteDigitos('(11) 98734-2156')).toBe('11987342156')
  })
})
