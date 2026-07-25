import { formatBRL, parseBRL, splitInstallments, sumCents } from './money'

describe('parseBRL', () => {
  test('aceita as quatro formas de entrada', () => {
    expect(parseBRL('1.360,00')).toBe(136000)
    expect(parseBRL('1360,00')).toBe(136000)
    expect(parseBRL('1360')).toBe(136000)
    expect(parseBRL('R$ 1.360,00')).toBe(136000)
  })

  test('aceita R$ colado, espaços nas bordas e negativo', () => {
    expect(parseBRL('R$1.360,00')).toBe(136000)
    expect(parseBRL('  R$ 1.360,00  ')).toBe(136000)
    expect(parseBRL('-R$ 1.360,00')).toBe(-136000)
    expect(parseBRL('-1360,00')).toBe(-136000)
  })

  test('um dígito decimal vale dezena de centavo', () => {
    expect(parseBRL('10,5')).toBe(1050)
    expect(parseBRL('0,05')).toBe(5)
  })

  test('zero nunca volta como -0', () => {
    expect(Object.is(parseBRL('-0,00'), 0)).toBe(true)
    expect(parseBRL('0')).toBe(0)
  })

  test('milhão com dois separadores', () => {
    expect(parseBRL('R$ 1.000.000,00')).toBe(100000000)
  })

  test('rejeita entrada inválida com RangeError', () => {
    expect(() => parseBRL('')).toThrow(RangeError)
    expect(() => parseBRL('abc')).toThrow(RangeError)
    expect(() => parseBRL('1.36')).toThrow(RangeError)
    expect(() => parseBRL('12.3456')).toThrow(RangeError)
    expect(() => parseBRL('1,234')).toThrow(RangeError)
    expect(() => parseBRL('1.360,00 reais')).toThrow(RangeError)
    expect(() => parseBRL('R$')).toThrow(RangeError)
  })
})

describe('formatBRL', () => {
  test('formata zero, centavo, milhar e milhão', () => {
    expect(formatBRL(0)).toBe('R$ 0,00')
    expect(formatBRL(5)).toBe('R$ 0,05')
    expect(formatBRL(136000)).toBe('R$ 1.360,00')
    expect(formatBRL(100000000)).toBe('R$ 1.000.000,00')
  })

  test('formata negativo com o sinal antes do R$', () => {
    expect(formatBRL(-136000)).toBe('-R$ 1.360,00')
    expect(formatBRL(-5)).toBe('-R$ 0,05')
  })

  test('não usa espaço não-quebrável (U+00A0) como o Intl usa', () => {
    expect(formatBRL(136000)).not.toContain('\u00a0')
  })

  test('round-trip parse -> format -> parse', () => {
    for (const cents of [0, 1, 99, 100, 136000, -136000, 100000000]) {
      expect(parseBRL(formatBRL(cents))).toBe(cents)
    }
  })

  test('rejeita não-inteiro com RangeError', () => {
    expect(() => formatBRL(10.5)).toThrow(RangeError)
    expect(() => formatBRL(NaN)).toThrow(RangeError)
  })
})

describe('splitInstallments', () => {
  test('R$ 100,00 em 3x põe o resto nas primeiras', () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333])
  })

  test('divisão exata não sobra centavo', () => {
    expect(splitInstallments(9999, 3)).toEqual([3333, 3333, 3333])
  })

  test('1x devolve o total inteiro', () => {
    expect(splitInstallments(136000, 1)).toEqual([136000])
  })

  test('a soma das parcelas é sempre o total (propriedade)', () => {
    const totais = [1, 2, 7, 99, 100, 10000, 136000, 280000, 999999, 123457]
    const contagens = [1, 2, 3, 6, 7, 10, 12, 13, 24, 60, 359, 360]
    for (const total of totais) {
      for (const count of contagens) {
        const parcelas = splitInstallments(total, count)
        expect(parcelas).toHaveLength(count)
        expect(sumCents(parcelas)).toBe(total)
        expect(
          Math.max(...parcelas) - Math.min(...parcelas),
        ).toBeLessThanOrEqual(1)
      }
    }
  })

  test('rejeita total e contagem fora do domínio do schema', () => {
    expect(() => splitInstallments(0, 3)).toThrow(RangeError)
    expect(() => splitInstallments(-100, 3)).toThrow(RangeError)
    expect(() => splitInstallments(10.5, 3)).toThrow(RangeError)
    expect(() => splitInstallments(10000, 0)).toThrow(RangeError)
    expect(() => splitInstallments(10000, 361)).toThrow(RangeError)
    expect(() => splitInstallments(10000, 2.5)).toThrow(RangeError)
  })
})

describe('sumCents', () => {
  test('soma lista vazia, positivos e negativos', () => {
    expect(sumCents([])).toBe(0)
    expect(sumCents([3334, 3333, 3333])).toBe(10000)
    expect(sumCents([-50000, 20000, 30000])).toBe(0)
  })

  test('rejeita valor não-inteiro com RangeError', () => {
    expect(() => sumCents([100, 0.5])).toThrow(RangeError)
  })
})
