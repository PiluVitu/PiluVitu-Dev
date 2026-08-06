/**
 * Os 9 casos de `apps/api/internal/votacao/sortear_test.go` são o alvo desta
 * suíte (happy path, cada filtro isolado, sem candidatos ×2, determinismo,
 * ordenação) — mais testes específicos de TS pra provar que o `rng`
 * injetado (nunca `Math.random` direto) é o que decide a escolha dentro de
 * cada categoria.
 */
import { describe, expect, it, vi } from 'vitest'
import type { SheetMovie } from '../lib/gsheets'
import { NoCandidatesError, type Rng, sortOnePerCategory } from './sortear'

/** Espelha `sample()` de `sortear_test.go` — mesmos 5 filmes, mesma ordem. */
function sample(): SheetMovie[] {
  return [
    {
      number: 1,
      title: 'A Coisa',
      type: 'filme',
      category: 'terror',
      watched: false,
    },
    {
      number: 2,
      title: 'Hereditário',
      type: 'filme',
      category: 'terror',
      watched: false,
    },
    {
      number: 3,
      title: 'John Wick',
      type: 'filme',
      category: 'ação',
      watched: true,
    },
    {
      number: 4,
      title: 'Breaking Bad',
      type: 'serie',
      category: 'drama',
      watched: false,
    },
    {
      number: 5,
      title: 'Forrest Gump',
      type: 'filme',
      category: 'drama',
      watched: false,
    },
  ]
}

/**
 * PRNG determinístico (mulberry32) — só pra teste. Duas instâncias criadas
 * com a MESMA seed produzem a MESMA sequência de valores em `[0, 1)`; a
 * mesma instância NUNCA repete (é o que faz o teste de determinismo com
 * seed exigir DUAS instâncias, uma por chamada — mesma forma de
 * `rand.New(rand.NewSource(42))` ser criado duas vezes no Go).
 */
function seededRng(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** `rng` de fila — consome os valores passados, na ordem, e recicla. */
function queueRng(values: number[]): Rng {
  let i = 0
  return () => {
    const v = values[i % values.length]
    i += 1
    return v
  }
}

describe('sortOnePerCategory — happy path e filtros (paridade com sortear_test.go)', () => {
  it('happy path: 1 filme por categoria, sem duplicar categoria', () => {
    const got = sortOnePerCategory(
      sample(),
      { includeWatched: true },
      seededRng(1),
    )
    expect(got).toHaveLength(3)
    const categorias = new Set(got.map((m) => m.category))
    expect(categorias.size).toBe(3)
  })

  it('filtra por type — só sobra a série', () => {
    const got = sortOnePerCategory(sample(), { types: ['serie'] }, seededRng(1))
    expect(got).toHaveLength(1)
    expect(got[0]?.type).toBe('serie')
  })

  it('exclui assistidos por default (includeWatched ausente = false)', () => {
    const got = sortOnePerCategory(sample(), {}, seededRng(1))
    for (const m of got) {
      expect(m.watched).toBe(false)
    }
  })

  it('includeWatched:true inclui a categoria que só tem filme assistido', () => {
    const got = sortOnePerCategory(
      sample(),
      { includeWatched: true },
      seededRng(1),
    )
    expect(got).toHaveLength(3)
  })

  it('filtra por categories — só as categorias pedidas aparecem', () => {
    const got = sortOnePerCategory(
      sample(),
      { categories: ['terror', 'drama'], includeWatched: true },
      seededRng(1),
    )
    expect(got).toHaveLength(2)
    for (const m of got) {
      expect(['terror', 'drama']).toContain(m.category)
    }
  })

  it('lista vazia de entrada ⇒ NoCandidatesError', () => {
    expect(() => sortOnePerCategory([], {}, seededRng(1))).toThrow(
      NoCandidatesError,
    )
  })

  it('todos os filmes descartados pelo filtro ⇒ NoCandidatesError', () => {
    const movies: SheetMovie[] = [
      {
        number: 1,
        title: 'Only',
        type: 'filme',
        category: 'terror',
        watched: true,
      },
    ]
    expect(() =>
      sortOnePerCategory(movies, { includeWatched: false }, seededRng(1)),
    ).toThrow(NoCandidatesError)
  })

  it('determinístico com a mesma seed — duas chamadas independentes produzem a mesma saída', () => {
    const movies = sample()
    const a = sortOnePerCategory(
      movies,
      { includeWatched: true },
      seededRng(42),
    )
    const b = sortOnePerCategory(
      movies,
      { includeWatched: true },
      seededRng(42),
    )
    expect(a).toEqual(b)
  })

  it('categorias saem ordenadas alfabeticamente — ação, drama, terror', () => {
    const got = sortOnePerCategory(
      sample(),
      { includeWatched: true },
      seededRng(1),
    )
    expect(got.map((m) => m.category)).toEqual(['ação', 'drama', 'terror'])
  })
})

describe('sortOnePerCategory — o rng injetado decide a escolha (nunca Math.random)', () => {
  it('rng sempre 0 escolhe sempre o PRIMEIRO candidato de cada grupo, na ordem alfabética das categorias', () => {
    // Ordem de inserção no agrupamento (segue `sample()`): terror antes de
    // ação antes de drama. Ordenado por categoria: ação, drama, terror.
    const got = sortOnePerCategory(
      sample(),
      { includeWatched: true },
      queueRng([0, 0, 0]),
    )
    expect(got.map((m) => m.title)).toEqual([
      'John Wick', // ação — único candidato
      'Breaking Bad', // drama — primeiro da lista [Breaking Bad, Forrest Gump]
      'A Coisa', // terror — primeiro da lista [A Coisa, Hereditário]
    ])
  })

  it('rng perto de 1 escolhe sempre o ÚLTIMO candidato de cada grupo', () => {
    const got = sortOnePerCategory(
      sample(),
      { includeWatched: true },
      queueRng([0.999999, 0.999999, 0.999999]),
    )
    expect(got.map((m) => m.title)).toEqual([
      'John Wick', // ação — único candidato, índice 0 de qualquer forma
      'Forrest Gump', // drama — último da lista
      'Hereditário', // terror — último da lista
    ])
  })

  it('nunca chama Math.random — a escolha vem só do rng injetado', () => {
    const spy = vi.spyOn(Math, 'random')
    sortOnePerCategory(sample(), { includeWatched: true }, seededRng(7))
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
