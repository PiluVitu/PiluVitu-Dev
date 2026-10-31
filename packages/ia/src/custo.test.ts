import { describe, expect, it } from 'vitest'
import { PRECOS, custoMicroUsd, estimativaMicroUsd } from './custo'

describe('PRECOS', () => {
  it('guarda os preços por MTok em micro-dólar inteiro', () => {
    expect(PRECOS['claude-sonnet-5-5']).toEqual({
      entradaMicroPorMTok: 2_000_000,
      saidaMicroPorMTok: 10_000_000,
    })
    expect(PRECOS['claude-haiku-5-5']).toEqual({
      entradaMicroPorMTok: 100_000,
      saidaMicroPorMTok: 500_000,
    })
  })
})

describe('custoMicroUsd', () => {
  it('1 000 000 de tokens de entrada no Sonnet custa US$ 2', () => {
    expect(
      custoMicroUsd('claude-sonnet-5-5', {
        input_tokens: 1_000_000,
        output_tokens: 0,
      }),
    ).toBe(2_000_000)
  })

  it('1 token de saída no Haiku arredonda para cima, para 1 micro', () => {
    expect(
      custoMicroUsd('claude-haiku-5-5', { input_tokens: 0, output_tokens: 1 }),
    ).toBe(1)
  })

  it('soma entrada e saída', () => {
    // 1000 × 2 + 500 × 10 = 2000 + 5000
    expect(
      custoMicroUsd('claude-sonnet-5-5', {
        input_tokens: 1000,
        output_tokens: 500,
      }),
    ).toBe(7000)
  })

  it('cobra a leitura de cache a 0,1× e a escrita a 1,25× da entrada', () => {
    // Sonnet: leitura 1 000 000 × 0,2 = 200 000; escrita 1 000 000 × 2,5 = 2 500 000
    expect(
      custoMicroUsd('claude-sonnet-5-5', {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 1_000_000,
      }),
    ).toBe(200_000)
    expect(
      custoMicroUsd('claude-sonnet-5-5', {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 1_000_000,
      }),
    ).toBe(2_500_000)
  })

  it('aceita os campos de cache como null, como a SDK devolve', () => {
    expect(
      custoMicroUsd('claude-haiku-5-5', {
        input_tokens: 10,
        output_tokens: 2,
        cache_read_input_tokens: null,
        cache_creation_input_tokens: null,
      }),
    ).toBe(2)
  })

  it('arredonda o total, não cada parcela', () => {
    // Haiku: 3 de entrada (0,3) + 1 de saída (0,5) = 0,8 → 1
    expect(
      custoMicroUsd('claude-haiku-5-5', { input_tokens: 3, output_tokens: 1 }),
    ).toBe(1)
  })

  it('zero tokens custa zero', () => {
    expect(
      custoMicroUsd('claude-sonnet-5-5', { input_tokens: 0, output_tokens: 0 }),
    ).toBe(0)
  })

  it('devolve sempre inteiro', () => {
    const custo = custoMicroUsd('claude-haiku-5-5', {
      input_tokens: 12_345,
      output_tokens: 678,
      cache_read_input_tokens: 9,
      cache_creation_input_tokens: 7,
    })
    expect(Number.isInteger(custo)).toBe(true)
  })
})

describe('estimativaMicroUsd', () => {
  it('estima a entrada em ceil(caracteres / 2) tokens mais maxTokens de saída', () => {
    // ceil(1000 × 0,1) + ceil(1000 × 0,5) = 100 + 500
    expect(estimativaMicroUsd('claude-haiku-5-5', 2000, 1000)).toBe(600)
  })

  it('caractere ímpar arredonda o token para cima', () => {
    // Sonnet: ceil(3 / 2) = 2 tokens × 2 = 4; sem saída
    expect(estimativaMicroUsd('claude-sonnet-5-5', 3, 0)).toBe(4)
  })

  it('nunca fica abaixo do custo real de uma resposta que usa o maxTokens inteiro', () => {
    const caracteres = 10_000
    const maxTokens = 600
    const real = custoMicroUsd('claude-sonnet-5-5', {
      input_tokens: Math.ceil(caracteres / 4),
      output_tokens: maxTokens,
    })
    expect(
      estimativaMicroUsd('claude-sonnet-5-5', caracteres, maxTokens),
    ).toBeGreaterThanOrEqual(real)
  })
})
