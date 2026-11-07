import { describe, expect, it } from 'vitest'
import {
  estadoDoOrcamento,
  larguraDaBarra,
  mesPorExtenso,
  ordenarLinhas,
  percentualUsado,
  type LinhaOrcamento,
} from './orcamento'

describe('estadoDoOrcamento', () => {
  it('sem orçamento quando não há valor definido', () => {
    expect(estadoDoOrcamento(null, 5000)).toBe('sem_orcamento')
  })
  it('dentro quando o gasto é menor, zero ou exatamente igual', () => {
    expect(estadoDoOrcamento(10000, 0)).toBe('dentro')
    expect(estadoDoOrcamento(10000, 9999)).toBe('dentro')
    expect(estadoDoOrcamento(10000, 10000)).toBe('dentro')
  })
  it('estourado só acima de 100%', () => {
    expect(estadoDoOrcamento(10000, 10001)).toBe('estourado')
  })
})

describe('percentualUsado', () => {
  it('arredonda e passa de 100 quando estoura', () => {
    expect(percentualUsado(30000, 10000)).toBe(33)
    expect(percentualUsado(10000, 15000)).toBe(150)
    expect(percentualUsado(10000, 0)).toBe(0)
  })
  it('nulo sem orçamento', () => {
    expect(percentualUsado(null, 100)).toBeNull()
  })
})

describe('larguraDaBarra', () => {
  it('limita a barra entre 0 e 100', () => {
    expect(larguraDaBarra(10000, 2500)).toBe(25)
    expect(larguraDaBarra(10000, 99999)).toBe(100)
    expect(larguraDaBarra(null, 500)).toBe(0)
  })
})

describe('mesPorExtenso', () => {
  it('escreve mês e ano em português', () => {
    expect(mesPorExtenso('2026-08')).toBe('agosto de 2026')
    expect(mesPorExtenso('2026-01')).toBe('janeiro de 2026')
  })
})

describe('ordenarLinhas', () => {
  const linha = (
    nome: string,
    b: number | null,
    g: number,
  ): LinhaOrcamento => ({
    category_id: nome,
    category_name: nome,
    parent_name: null,
    budget_cents: b,
    spent_cents: g,
    budgetable: true,
  })
  it('estourados primeiro, depois os orçados por % e por fim os sem orçamento por gasto', () => {
    const ordem = ordenarLinhas([
      linha('Sem A', null, 100),
      linha('Folga', 10000, 1000),
      linha('Sem B', null, 900),
      linha('Estoura', 10000, 20000),
      linha('Quase', 10000, 9000),
    ]).map((l) => l.category_name)
    expect(ordem).toEqual(['Estoura', 'Quase', 'Folga', 'Sem B', 'Sem A'])
  })
  it('não altera o array recebido', () => {
    const entrada = [linha('B', null, 1), linha('A', 100, 5)]
    ordenarLinhas(entrada)
    expect(entrada[0].category_name).toBe('B')
  })
})
