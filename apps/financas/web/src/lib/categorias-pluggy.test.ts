import { describe, expect, test } from 'vitest'
import { categoriaDoPluggy, familiaPluggy } from './categorias-pluggy'

const CATEGORIAS = [
  { id: 'c-renda', slug: 'pluggy-01' },
  { id: 'c-mesma', slug: 'pluggy-04' },
  { id: 'c-transf-in', slug: 'pluggy-05-in' },
  { id: 'c-transf-out', slug: 'pluggy-05-out' },
  { id: 'c-mercado', slug: 'pluggy-10' },
  { id: 'c-propria', slug: null },
]

describe('familiaPluggy', () => {
  test('os dois primeiros dígitos são a família', () => {
    expect(familiaPluggy('10000000')).toBe('10')
    expect(familiaPluggy('05070000')).toBe('05')
    // Uma das folhas do Pluggy tem 9 dígitos (200300000) — o prefixo salva.
    expect(familiaPluggy('200300000')).toBe('20')
  })

  test('devolve null para o que não é id de categoria', () => {
    expect(familiaPluggy(null)).toBeNull()
    expect(familiaPluggy(undefined)).toBeNull()
    expect(familiaPluggy('')).toBeNull()
    expect(familiaPluggy('abc')).toBeNull()
  })
})

describe('categoriaDoPluggy', () => {
  test('mapeia pela família, não pela folha', () => {
    // O ponto do desenho: uma folha que este app NUNCA viu (Supermercado não
    // tem filhos hoje) cai na família existente sem código novo.
    expect(categoriaDoPluggy('10000000', -5000, CATEGORIAS)).toBe('c-mercado')
    expect(categoriaDoPluggy('10999999', -5000, CATEGORIAS)).toBe('c-mercado')
  })

  test('⚠️ família 05 escolhe pelo SINAL, porque o Pluggy não diz quem pagou quem', () => {
    // "Transfer - PIX" só informa o meio. Um PIX recebido de terceiro é
    // receita; achatar os dois num registro só erraria o fluxo de caixa.
    expect(categoriaDoPluggy('05070000', 21000, CATEGORIAS)).toBe('c-transf-in')
    expect(categoriaDoPluggy('05070000', -799, CATEGORIAS)).toBe('c-transf-out')
  })

  test('04 é transferência de verdade e NÃO depende do sinal', () => {
    // Mesma titularidade é a única que o Pluggy afirma ser interna.
    expect(categoriaDoPluggy('04000000', 10000, CATEGORIAS)).toBe('c-mesma')
    expect(categoriaDoPluggy('04000000', -10000, CATEGORIAS)).toBe('c-mesma')
  })

  test('⚠️ a família 99 ("Outros") NÃO vira sugestão', () => {
    // É o balde de "não sei" do Pluggy: sugerir algo ali daria ares de
    // classificação ao que não tem nenhuma.
    expect(categoriaDoPluggy('99999999', -100, CATEGORIAS)).toBeNull()
  })

  test('família sem categoria correspondente devolve null, nunca chuta', () => {
    // Família que o Pluggy criar amanhã: sem slug, sem sugestão. O script
    // scripts/pluggy-categorias.mjs é quem avisa que ela apareceu.
    expect(categoriaDoPluggy('77000000', -100, CATEGORIAS)).toBeNull()
  })

  test('sem categoryId não há o que mapear', () => {
    expect(categoriaDoPluggy(null, -100, CATEGORIAS)).toBeNull()
    expect(categoriaDoPluggy(undefined, -100, CATEGORIAS)).toBeNull()
  })

  test('categoria do dono, sem slug, nunca é escolhida por acidente', () => {
    expect(
      categoriaDoPluggy('10000000', -100, [{ id: 'x', slug: null }]),
    ).toBeNull()
  })
})
