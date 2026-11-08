import { describe, expect, it } from 'vitest'
import {
  estadoDoOrcamento,
  larguraDaBarra,
  marcaDeHoje,
  mesAbreviado,
  mesPorExtenso,
  ordenarLinhas,
  percentualUsado,
  resumoDoMes,
  type LinhaOrcamento,
} from './orcamento'

describe('estadoDoOrcamento', () => {
  it('sem orçamento quando não há valor definido', () => {
    expect(estadoDoOrcamento(null, 5000)).toBe('sem_orcamento')
  })
  it('dentro abaixo de 80%', () => {
    expect(estadoDoOrcamento(10000, 0)).toBe('dentro')
    expect(estadoDoOrcamento(10000, 7999)).toBe('dentro')
  })
  it('atenção de 80% até o limite exato, que ainda não estourou', () => {
    expect(estadoDoOrcamento(10000, 8000)).toBe('atencao')
    expect(estadoDoOrcamento(10000, 9999)).toBe('atencao')
    expect(estadoDoOrcamento(10000, 10000)).toBe('atencao')
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

describe('mesAbreviado', () => {
  it('abrevia o mês em três letras', () => {
    expect(mesAbreviado('2026-11')).toBe('nov')
    expect(mesAbreviado('2026-03')).toBe('mar')
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
    average_3m_cents: 0,
  })
  it('estourados, depois atenção, depois dentro e por fim os sem orçamento', () => {
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

describe('resumoDoMes', () => {
  const l = (b: number | null, g: number): LinhaOrcamento => ({
    category_id: `c${b}-${g}`,
    category_name: 'x',
    parent_name: null,
    budget_cents: b,
    spent_cents: g,
    budgetable: true,
    average_3m_cents: 0,
  })
  it('soma orçado, gasto, o que ainda dá e o estouro só das categorias com limite', () => {
    const r = resumoDoMes([
      l(100000, 134000), // estoura 34000
      l(40000, 45000), // estoura 5000
      l(200000, 190000), // resta 10000
      l(60000, 30000), // resta 30000
      l(null, 99999), // sem limite: fora
    ])
    expect(r).toEqual({
      com_limite_count: 4,
      orcado_cents: 400000,
      gasto_cents: 399000,
      pct: 100,
      ainda_da_cents: 40000,
      estourado_cents: 39000,
      estourado_count: 2,
    })
  })
  it('sem nenhum limite zera tudo e o percentual fica nulo', () => {
    expect(resumoDoMes([l(null, 500)])).toEqual({
      com_limite_count: 0,
      orcado_cents: 0,
      gasto_cents: 0,
      pct: null,
      ainda_da_cents: 0,
      estourado_cents: 0,
      estourado_count: 0,
    })
  })
})

describe('marcaDeHoje', () => {
  it('no mês corrente devolve o dia, a posição e quantos dias faltam', () => {
    expect(marcaDeHoje('2026-11', '2026-11-07')).toEqual({
      dia: 7,
      dias_no_mes: 30,
      pct: 23,
      faltam: 23,
    })
  })
  it('conhece fevereiro, inclusive bissexto', () => {
    expect(marcaDeHoje('2028-02', '2028-02-29')).toMatchObject({
      dias_no_mes: 29,
      faltam: 0,
      pct: 100,
    })
    expect(marcaDeHoje('2027-02', '2027-02-10')).toMatchObject({
      dias_no_mes: 28,
    })
  })
  it('outro mês, passado ou futuro, não tem marca', () => {
    expect(marcaDeHoje('2026-10', '2026-11-07')).toBeNull()
    expect(marcaDeHoje('2026-12', '2026-11-07')).toBeNull()
  })
})
