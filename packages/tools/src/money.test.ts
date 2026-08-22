import {
  formatBRL,
  formatBRLSemCentavos,
  parseBRL,
  splitInstallments,
  sumCents,
} from './money'

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

describe('formatBRLSemCentavos', () => {
  test('o caso que motivou a função: R$ 21.122,50 cabe nos 139px do grid', () => {
    expect(formatBRL(2112250)).toBe('R$ 21.122,50')
    expect(formatBRLSemCentavos(2112250)).toBe('R$ 21.123')
  })

  // ⚠️ ARREDONDA, não trunca — e a fronteira é o meio real. Uma implementação
  // com Math.trunc/Math.floor passa em `,49` e falha em `,50`, então os DOIS
  // lados precisam estar aqui: só um deles não distingue as duas regras.
  test.each([
    [2112249, 'R$ 21.122', 'logo abaixo do meio real: desce'],
    [2112250, 'R$ 21.123', 'exatamente no meio real: sobe'],
    [2112251, 'R$ 21.123', 'logo acima do meio real: sobe'],
    [2112200, 'R$ 21.122', 'sem centavos: fica igual'],
  ])('%i → %s (%s)', (cents, esperado) => {
    expect(formatBRLSemCentavos(cents)).toBe(esperado)
  })

  // ⚠️ Math.round(-0.5) é -0 e Math.round(0.5) é 1 — arredondar o valor COM
  // sinal faria meio real cair pra lados diferentes conforme a direção. A
  // magnitude é arredondada primeiro, então negativo espelha o positivo.
  test('o negativo espelha o positivo no meio real (arredonda a magnitude)', () => {
    expect(formatBRLSemCentavos(-2112250)).toBe('-R$ 21.123')
    expect(formatBRLSemCentavos(-2112249)).toBe('-R$ 21.122')
  })

  test('nunca imprime "-R$ 0": centavos negativos que somem viram R$ 0', () => {
    expect(formatBRLSemCentavos(-49)).toBe('R$ 0')
    expect(formatBRLSemCentavos(-50)).toBe('-R$ 1')
    expect(formatBRLSemCentavos(0)).toBe('R$ 0')
  })

  test('separador de milhar em cada casa, igual ao formatBRL', () => {
    expect(formatBRLSemCentavos(99900)).toBe('R$ 999')
    expect(formatBRLSemCentavos(100000)).toBe('R$ 1.000')
    expect(formatBRLSemCentavos(123456789)).toBe('R$ 1.234.568')
  })

  test('rejeita centavos não-inteiros, igual ao formatBRL', () => {
    expect(() => formatBRLSemCentavos(10.5)).toThrow(RangeError)
    expect(() => formatBRLSemCentavos(Number.NaN)).toThrow(RangeError)
  })

  // ⚠️ O ponto desta suíte inteira: a operação NÃO é aditiva, e o que se
  // escolhe é o TAMANHO do desencontro. Estes dois casos existem pra que
  // ninguém "conserte" a divergência achando que é bug — e pra travar o
  // limite de 50 centavos por valor, que é o que arredondar compra sobre
  // truncar.
  test('a soma das partes pode não bater com o total — e o erro é ≤ 50 centavos por parte', () => {
    const partes = [2112250, 33350, 1250] // R$ 21.122,50 + R$ 333,50 + R$ 12,50
    const total = sumCents(partes)

    expect(partes.map(formatBRLSemCentavos)).toEqual([
      'R$ 21.123',
      'R$ 334',
      'R$ 13',
    ])
    // 21123 + 334 + 13 = 21470, mas o total real é R$ 21.468,50 → R$ 21.469.
    expect(formatBRLSemCentavos(total)).toBe('R$ 21.469')

    for (const parte of partes) {
      const exibido = Number(
        formatBRLSemCentavos(parte).replace(/[^\d-]/g, '') + '00',
      )
      expect(Math.abs(exibido - parte)).toBeLessThanOrEqual(50)
    }
  })

  test('truncar dobraria o erro e o empurraria sempre pro mesmo lado', () => {
    // Toda parte a R$ x,99: arredondando, cada uma erra +1 centavo de real pra
    // cima e o total também sobe; truncando, cada uma perderia 99 centavos e o
    // desencontro cresceria com o tamanho da lista, sempre no mesmo sentido.
    const partes = [199, 299, 399, 499, 599, 699, 799, 899]
    expect(partes.map(formatBRLSemCentavos)).toEqual([
      'R$ 2',
      'R$ 3',
      'R$ 4',
      'R$ 5',
      'R$ 6',
      'R$ 7',
      'R$ 8',
      'R$ 9',
    ])
    expect(formatBRLSemCentavos(sumCents(partes))).toBe('R$ 44')
    // 2+3+4+5+6+7+8+9 = 44 — bate. Com truncamento seria 1+2+…+8 = 36 contra
    // um total truncado de R$ 43: R$ 7 de diferença numa lista de 8 linhas.
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
