import { describe, expect, it } from 'vitest'
import { normalizeName, sugerirPayee } from './payee-suggest'

describe('normalizeName — espelho da SPA de domain/payees.ts (Worker)', () => {
  it('caixa alta, sem acento, sem pontuação', () => {
    expect(normalizeName('Padaria Ção & Cia.')).toBe('PADARIA CAO CIA')
  })

  it('corta sufixo de maquininha', () => {
    expect(normalizeName('Mercado X PagSeguro')).toBe('MERCADO X')
  })

  // Limitação conhecida e aceita (mesma do original, domain/payees.ts) — é
  // exatamente por isso que a sugestão é confirmável, nunca gravada sozinha.
  it('corta sigla de estado do fim — limitação conhecida', () => {
    expect(normalizeName('Comercial SP')).toBe('COMERCIAL')
  })
})

describe('sugerirPayee — casa por norm_name, nunca cria', () => {
  const payees = [
    {
      id: 'p1',
      name: 'Padaria X',
      norm_name: 'PADARIA X',
      default_category_id: 'cat-alimentacao',
    },
    {
      id: 'p2',
      name: 'Uber',
      norm_name: 'UBER',
      default_category_id: null,
    },
  ]

  it('encontra o payee cujo norm_name bate com a descrição normalizada', () => {
    expect(sugerirPayee('Padaria X PagSeguro', payees)).toEqual(payees[0])
  })

  it('sem match, devolve null (nunca inventa um payee)', () => {
    expect(sugerirPayee('LOJA DESCONHECIDA 123', payees)).toBeNull()
  })

  it('descrição vazia/só ruído normaliza pra string vazia e não casa nada', () => {
    expect(sugerirPayee('###', payees)).toBeNull()
  })
})
