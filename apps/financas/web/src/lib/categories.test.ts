import { describe, expect, it } from 'vitest'
import { ordenarPorHierarquia, type CategoryView } from './categories'

function cat(over: Partial<CategoryView> & { id: string }): CategoryView {
  return {
    parent_id: null,
    name: over.id,
    kind: 'expense',
    slug: null,
    default_scope: null,
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('ordenarPorHierarquia', () => {
  it('põe cada filha logo abaixo da própria mãe, tudo em ordem alfabética', () => {
    const nos = ordenarPorHierarquia([
      cat({ id: 'das', name: 'DAS', parent_id: 'pj' }),
      cat({ id: 'mercado', name: 'Mercado' }),
      cat({ id: 'pj', name: 'Custos da PJ' }),
      cat({ id: 'contador', name: 'Contador', parent_id: 'pj' }),
    ])

    // Ordem alfabética GLOBAL daria Contador/Custos da PJ/DAS/Mercado — o que
    // se quer é a mãe seguida das próprias filhas.
    expect(nos.map((n) => [n.categoria.id, n.nivel])).toEqual([
      ['pj', 0],
      ['contador', 1],
      ['das', 1],
      ['mercado', 0],
    ])
  })

  // O caso que nenhuma tela alcança sozinha: a lista chega filtrada (a tela
  // Lançar filtra por `kind` no cliente) ou a mãe está arquivada. Descartar a
  // filha esconderia uma categoria REAL por causa de um filtro sobre OUTRA
  // linha; deixá-la em `nivel: 1` renderizaria indentação pendurada em nada.
  it('filha cuja mãe não está na lista vira raiz, no fim — nunca some', () => {
    const nos = ordenarPorHierarquia([
      cat({ id: 'das', name: 'DAS', parent_id: 'pj-ausente' }),
      cat({ id: 'mercado', name: 'Mercado' }),
    ])

    expect(nos.map((n) => [n.categoria.id, n.nivel])).toEqual([
      ['mercado', 0],
      ['das', 0],
    ])
  })

  it('lista vazia devolve lista vazia', () => {
    expect(ordenarPorHierarquia([])).toEqual([])
  })
})
